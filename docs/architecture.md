# Architecture

## Topology

```
friends' browsers ──HTTPS/WSS──▶ Tailscale Funnel (hshi-u1) ──▶ 127.0.0.1:3000  clocktower-prod
developer (SSH -L 3001) ─────────────────────────────────────▶ 127.0.0.1:3001  clocktower-dev
all browsers ──WebRTC (UDP/TURN)──▶ LiveKit Cloud (never via Funnel)
```

- **hshi-u1** (Ubuntu 22.04, x86_64, 12 cores, 15 GiB) runs both environments as separate
  `systemd --user` services with separate release dirs, env files, SQLite DBs and logs:
  - `~/clocktower/releases/<sha>/` immutable builds; `~/clocktower/prod` → symlink to the tested release
  - `~/clocktower/dev/` dev checkout (rebuilt freely; never touches prod)
  - `~/clocktower/env/{dev,prod}.env` (chmod 600), `~/clocktower/data/{dev,prod}/clocktower.db`
  - `~/clocktower/work/<agent>/` agent build/test sandboxes (see CLAUDE.md)
- One HTTP port per environment serves SPA, JSON API, SSE lobby directory and Colyseus WS.

## Packages

| Package | Role |
|---|---|
| `@ct/protocol` | Zod schemas + DTO types for every HTTP route and C2S/S2C message; shared constants; layout helpers (collision, `locationAt`, `inSquare`). |
| `@ct/rules` | Pure Trouble Brewing engine: setup tables, 22 characters, night order, nominations/votes, deaths, win checks, ST overrides; `projectForPlayer` / `projectForStoryteller`. No I/O. |
| `@ct/voice` | Pure acoustic-zone graph (zone per member from location+phase+visit), LiveKit room naming, grant/token helpers, quota math. |
| `@ct/assets` | Handcrafted town layout (`TownLayout`), deterministic PNG generators, generated sprite sheets/tiles/maps. |
| `@ct/db` | SQLite (WAL) + Drizzle schema/migrations; accounts, sessions, stats repositories. |
| `apps/server` | Express + Colyseus 0.16. Services (auth, directory, stats, voice usage) and one `GameRoom` per lobby composed of Game/World/Voice modules (`apps/server/src/rooms/modules.ts`). |
| `apps/client` | Vite + Preact UI shell + Phaser 3.90 town. |

## Identity & auth

- Account = random id + display name (non-unique). Credential = generated passphrase
  (≥ 70 bits; e.g. 6 words from a 7776-word list ≈ 77.5 bits), shown once.
- Storage: `lookup = HMAC-SHA256(PASSPHRASE_PEPPER, normalize(passphrase))` (unique index; lets us
  find the account without a username) **and** `verifier = scrypt(passphrase, per-account salt)`.
  Sign-in: find by lookup, constant-time verify scrypt. Plaintext never stored or logged.
- Session: 32 random bytes in HttpOnly, SameSite=Lax, Secure (https) cookie; DB stores SHA-256 of
  the token; 30-day sliding expiry. Sign-in rate-limited per IP (Funnel forwards client IP in
  `X-Forwarded-For` from loopback; `trust proxy = loopback`).
- **Duplicate sign-in policy:** multiple devices may be signed in. Within one lobby, an account has
  exactly one seat; a newer connection for the same account takes over the seat and the older
  connection is closed with code 4002 (`replaced`).
- Room join: `POST /api/lobbies/:id/ticket` → HMAC(SESSION_SECRET) ticket `{accountId, lobbyId,
  intent, exp=60s, nonce}`; `GameRoom.onAuth` verifies signature, lobby id and expiry and
  consumes the nonce (single use). Tickets for lobby A are rejected by lobby B.

## Lobby lifecycle (authoritative in LobbyDirectoryService + GameRoom)

```
create ──▶ WAITING ──start(ST, 5..max players)──▶ STARTING(setup) ──▶ DAY ⇄ NIGHT ──▶ FINISHED
              ▲                                                                     │
              └──────────────────────── rematch (same members) ─────────────────────┘
any state ──(no connected members for LOBBY_IDLE_TIMEOUT_SEC)──▶ DISPOSED (directory 'remove')
```

- `POST /api/lobbies`: directory checks `count < LOBBY_MAX_COUNT` and creates the Colyseus room
  (`matchMaker.createRoom('game', {lobbyId})`) inside a per-process mutex; ids are random
  (10 chars, URL-safe), collision-checked. Creator becomes host (+ ST if requested).
- Join is resolved synchronously in `onJoin` (single-threaded per room), so capacity/race checks
  are atomic: player seats ≤ `maxPlayers`; ST seat separate (exactly 0 or 1).
- After start the room is **locked** for new participants; only members with an assigned seat may
  re-enter (reconnection token or fresh `reconnect` ticket mapped by accountId → pid).
  Mid-game spectating is disabled.
- Waiting-room disconnect: seat held 30 s then released. In-game disconnect: seat held for the rest
  of the match (game never destroyed by brief disconnects); room disposes only after the idle timeout
  with zero connected members.
- Storyteller seat: claimed only while waiting via `lobby:claimStoryteller` (if open) or explicit
  `lobby:transferStoryteller` by host/current ST. ST is not counted in player capacity. During a
  game, if the ST disconnects the game pauses timers (bedtime countdown) until they return.
- Directory summaries are pushed over SSE (`/api/lobbies/stream`): snapshot on connect, then
  `upsert`/`remove`; client also re-fetches every 30 s.

## Per-client secret projection (most important invariant)

The server holds the full `GameState` inside the room's GameModule and **never** sends it. Each
fan-out computes, per member:

| Channel | Producer | Rule |
|---|---|---|
| `lobby:view` | GameRoom | public member info only (pid, name, cosmetics, ready, seat, host/ST flags). No account ids. |
| `game:view` | `rules.projectForPlayer(state, seat)` / `projectForStoryteller` | Whitelist construction. Player sees own believed character, own info/prompts, public deaths/votes. `storytellerVisitingYou` only for the visited player. ST view only to the seated ST. Full reveal only in `finished`. |
| `world:snapshot` | `WorldModule.snapshotFor(pid)` | Day: entities in the same location (outdoors sees outdoors; interior sees that interior). Night/bedtime-locked: player sees only entities inside their own home (so the ST appears only in the visited home). ST sees all. |
| `voice:grant` | VoiceCoordinator | One zone room token per member; private rooms per building/home; revoke on zone change. |
| `chat:message` | GameRoom + `voice.audienceOf` | Same audience as voice. |
| `sound` / `announcement` | Game/World | Public cues only (bell, dawn). Visit cues only to the visited home. |

Night-visit secrecy test: the byte stream to player A must be identical whether or not the ST
visits player B (modulo timestamps).

## Voice privacy model

- LiveKit Cloud project per environment if available; otherwise one project with room prefixes
  `dev-…` / `prod-…` and separate API keys if the plan allows.
- Zone rooms: `<prefix>-<lobbyId>-<zone>` where zone ∈ `square`, `street`, `bld-<buildingId>`.
  Members get a token for **exactly one** zone room (`roomJoin` for that room only, short TTL,
  `canSubscribe` true, `canPublish` per state). Moving zones → new grant + server-side
  `removeParticipant` from the old room (revocation). Night: each player is in their own
  `bld-house-N` room; the ST receives a grant for the visited home only while inside it.
- Square = full volume broadcast; street = client-side distance attenuation with hysteresis
  (documented limit: a modified client in the street room can un-attenuate street audio, but cannot
  reach square/indoor/night rooms). ST announcements: temporary `announce` room grant to everyone,
  publish only for ST.
- Quota: client heartbeats (`voice:status`) accumulate participant-minutes per env in SQLite;
  admin page shows usage vs `VOICE_MONTHLY_MINUTES`; at `exhausted`, new grants are refused with
  `voice:unavailable` (text chat continues).
- Room names: prefix is `[a-z0-9]+` (no `-`), lobby ids are escaped (`_`→`__`, `-`→`_d`) so
  `<prefix>-<lobby>-<zone>` is unambiguous across lobbies/envs. Tokens: identity = pid, TTL 10 min,
  publish source microphone only, no data channel, no admin.
- LiveKit token expiry only gates the initial join and a removed participant may rejoin while its
  token is valid, so after revoking a private/announce room the coordinator sweeps that room
  (`listParticipants` every 15 s for 20 min) and removes anyone not currently authorised.
- Dawn behaves like night for voice (players remain in their home zone until `day`).
- `@ct/voice` has two entries: `.` (server: LiveKit server SDK, tokens) and `./shared`
  (browser-safe: zone math, attenuation curve, quota levels). The client imports only `./shared`.
- Quota budget: participant-minutes = connected participants × minutes. 16 connected → 5,000/16 ≈
  312 min (≈5.2 h) per month; an 8-player 2-hour game ≈ 960 min. Usage is estimated from 30 s
  heartbeats (not reconciled with LiveKit analytics); dev and prod track separately.

## Contract change log

- 2026-10-14 M0: initial protocol (lead).
- 2026-10-14 M2 (voice): `VoiceRevoke.reason` gains `'announce_end'` (additive) — sent with `purpose:'announce'` when the Storyteller's announcement overlay ends (explicit stop, idle timeout, ST disconnect/role change).
