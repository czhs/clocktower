# Architecture

## Topology

```
friends' browsers ──HTTPS/WSS──▶ Cloudflare edge (clocktower.chrisshi.com) ══outbound tunnel══▶ cloudflared (hshi-u1) ──▶ 127.0.0.1:3000  clocktower-prod
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
- Public ingress (decided 2026-10-15 with the user): **Cloudflare Tunnel** (`clocktower-tunnel`
  systemd user unit, `~/.cloudflared/clocktower.yml`) routes only `clocktower.chrisshi.com` to
  127.0.0.1:3000. Chosen over Tailscale Funnel because the user's domain is already on Cloudflare
  DNS (stable branded URL, no Funnel bandwidth cap, no tailnet policy change). Funnel remains an
  optional fallback (needs tailnet policy approval). Client IPs for rate limiting come from
  `X-Forwarded-For` appended by Cloudflare (Express `trust proxy = loopback`).

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
- 2026-10-14 rules-storyteller: `game.ts` (additive) — `CHARACTER_INFO` (name/type/alignment/original short ability text for all 22), `CharacterInfo`, `EvilTeamView`, `SpyGrimoireEntry`/`SpyGrimoireView`; optional `PlayerGameView.you.evilTeam` / `you.butlerMasterSeat` / `you.canSlayerShot`, optional `PlayerGameView.spyGrimoire` (Spy's own view only), optional `NominationView.handsRaised` (public raised hands before the clock hand locks them).
- 2026-10-14 rules-storyteller: `storyteller.ts` (additive) — optional `GrimoireEntry.publicAlive/isRedHerring/isButlerMaster/abilityUsed`; optional `NightStepView.actingAs/impaired/prompt/suggestedInfo/notes`; optional `StorytellerGameView.bedtimeSeconds/pendingDeaths/canUndo/setupCounts/charactersAssigned/timerPaused`; exported `PromptSpecInput`/`InfoSpecInput` types; `assign_characters.allowNonstandard?`; `resolve_step.seats?/starpassSeat?/redirectSeat?` (ST target override, Imp star-pass choice, Mayor bounce).
- 2026-10-15 (lead): `Cosmetics.preset?: string | null` — premade astra-generated character id. Rendering precedence: preset (if known to the client's preset manifest) → layered cosmetics. Server must reject unknown preset ids (validate against `@ct/assets` preset manifest). Visual direction is owned by the assets/astra pipeline (user decision 2026-10-15).
- 2026-10-15 (playtest, logged by lead): `StCommand` gains `confirm_result`, `override_result`, `strike_vote`, `set_red_herring`, `set_drunk_belief`; `set_alive.restoreGhostVote`; `StorytellerGameView.pendingResult`. Detected game ends (Demon dead w/o successor, Saint executed, Mayor, two alive) now wait for the Storyteller to Confirm/Override (F7); players see nothing until confirmed.
- 2026-10-15 (lead, security): prod session cookie is `__Host-ct_session`; Colyseus matchmaker exposes only `joinById`/`reconnect`; `/matchmake` bodies capped at 4 KiB.
- 2026-10-15 (gameplay, applied by lead): WorldModule gains setCircle/setEscort/isHome/teleportTo/walkTo/setFrozen/setDoorLock/stageView (StageTarget/StageView in protocol storyteller.ts) — walking-not-teleporting, nomination circle, ST props.
- 2026-10-15 (gameplay): protocol, all additive:
  - **`storyteller.ts`, StCommand:** new commands `force_phase {to: setup|first_night|day|gather|bedtime|night|dawn}`, `gather {on}`, `force_vote {nominationId}`, `create_nomination {nominatorSeat, nomineeSeat, startVote?}`, `close_vote {mode: tally|cancel}`, `set_block {seat|null, votes?}`, `set_vote {nominationId, seat, vote}`, `force_execute {seat|null}`, `bedtime_timer {action: pause|resume|extend|restart, seconds?}`, `resend_prompt {seat, promptId}`, `resend_info {seat, infoId}`, `teleport {who, to}`, `walk_to {who, to|null}`, `freeze {who, frozen}`, `door_lock {buildingId, lock: locked|unlocked|default}`. Supporting exports: `FORCE_PHASES`, `StageWho`, `StageTarget`.
  - **`storyteller.ts`, views:** `StorytellerGameView` gains `gathering?`, `bedtimeOvertime?`, `timerHeld?`, `bedtimeRemainingMs?`, `bedtimeFirstNight?`, `stage?: StageView` (per-seat presence home/seated/walking/escorted/outdoors/inside, frozen, door overrides; ST only). `GrimoireEntry` gains `openPrompts?`, `sentPrompts?`, `info?`.
  - **`game.ts`:** `PlayerGameView` gains `gathering?` and `bedtimeOvertime?` (public).
  - **`world.ts`:** `WorldSnapshot` gains `you?: SelfControl` (own avatar only: `auto` = server walk with remaining path / `frozen`) and `doors?` (public ST door overrides). Adds `circleSpots(layout, seats)`, `circleCentre`, `circleRadii` and `CIRCLE_SEATED_PX`. `circleSpots` is the single source of truth for seat positions (one spot per seat on a ring around the clock tower, clockwise from 12 o'clock by seat = vote order).
  - **Behaviour:** `advance_phase 'bedtime'` is allowed from setup (it leads into the first night). Bedtime is "walk home": when the countdown ends the rules enter overtime and the world escorts stragglers (A*, doors, walking speed). Night falls once every player has been home for 3 s with the ST connected. A player who is home but not in bed walks to bed at nightfall; only a player still en route when the ST forces the night is teleported (`reason 'night'`). Nobody is moved at dawn/day. Movement validation: burst budget 2 s; failing moves that merely continue the pre-sync trajectory within 1.5 s of a teleport/correction are dropped silently (never applied), so there is no correction cascade on lossy links.
- 2026-10-15 (voice2, logged by lead): revocation sweep now covers EVERY room a member was revoked from (incl. square/street — closes a night-collusion loophole for modified clients) and keeps watching repeat rejoiners; street falloff retuned (full ≤2 tiles, −12 dB @6, −33 dB @8, silent @10); test-only `VOICE_TOKEN_TTL_SEC`; client exports `voiceActivity` / `voicePresence` stores (apps/client/src/voice/VoiceClient.ts).
- 2026-10-15 (lead): `/internal/active-games` (loopback-only, 404 via tunnel) used by the prod deploy guard; `/healthz` stays `{ok, env, version}`.
- 2026-10-15 (gameplay, door tags + ST settings), additive:
  - **Door tags:** `WorldSnapshot.doorTags?: Record<buildingId, DoorTag[]>` with `DoorTag {pid, ghost}`. This is public building occupancy, identical for every viewer. It is only sent in waiting / setup / day and is absent from bedtime through dawn. It never includes the Storyteller. `ghost` is the public alive status.
  - **ST settings:** `StCommand set_setting {settings: StSettingsPatch}`, plus `StSettings {doorTags}`, `DEFAULT_ST_SETTINGS` and `StorytellerGameView.settings`. This is a generic toggle mechanism: new settings are added as optional keys.
  - **WorldModule:** gains `applySettings(StSettings)`, applied by lead.
  - **Layout:** `TownLayout.circle?` is an optional ring override. New helpers `homeBuilding(layout, seat)` / `seatOfBuilding(layout, id)` mean gameplay derives homes from `houseIndex`, with no `house-N` id convention.
  - **Client data hook for the art:** `doorTagsStore` in apps/client/src/game/gameplay/doorTags.ts: buildingId → `{tags, shown (≤4), overflow}` with name / ghost / preset per tag. The in-world board there is a placeholder.
- 2026-10-15 (gameplay, rooms): GameRoom answers messages from a replaced/stale connection with `error {code:'forbidden', message:'stale_connection: …'}` + close 4102, instead of dropping them silently (warn log, rate-limited). Messages from a token-reconnecting client that arrive before it is re-bound are queued and replayed. Seat reservation time is now 30 s.
- 2026-10-15 (server-v2, v2 one-screen town), server + additive protocol:
  - **Speed:** `PLAYER_SPEED` 72 → **150 px/s** (`MOVE_TOLERANCE` 1.35 and `STORYTELLER_MAX_SPEED_MULT` 4 unchanged). Server movement burst budget `BURST_SECONDS` 2 → 1.5 s, so the longest single accepted jump stays ≈ 300 px (150 × 1.35 × 1.5) while a 0.9 s network stall is still absorbed. Server-driven walks (escort, walk_to, gather, walk to bed) use the same 150 px/s.
  - **Doors:** entering still needs the player outdoors within `DOOR_RANGE_PX` (22) of the outdoor door tile (below the footprint for 'south' cottages, beside it for 'east'/'west'). **Exiting works from anywhere inside** (fixed interior view + Leave button: the client sends `world:useDoor {buildingId: <the building it is in>}`). Phase / lock rules unchanged. Server-driven walks leave a building at once (no interior leg) and enter straight to their destination inside (bed / visit point / interior door).
  - **`StCommand` `teleport_self`** (additive): `{ type: 'teleport_self', to: { kind: 'point', x, y } | { kind: 'building', buildingId } }` (exported `StSelfTarget`). Seated Storyteller only (others: `error forbidden`); also accepted while the lobby is waiting and after the game finished. Point → nearest free OUTDOOR spot within 48 px (a point outside the town or inside an interior → `error invalid "Pick a spot in town"`); building → inside at its visit point (houses) exactly like `visit_home`, so at night it registers as a visit (visitingSeat, night-step 'visiting', `storytellerVisitingYou`, visit cue to that player only). The ST receives `world:teleport {reason:'storyteller'}`; nobody else is told anything (snapshots stay location-scoped; night: only the visited home sees the ST; door tags never include the ST). Logged by command type only. `WorldModule.teleportSelf(pid, to)` added to the module contract.
  - **Characters (roster rules):** `Cosmetics.preset` must be a playable roster id (`@ct/assets` `PLAYABLE_IDS`) for every NEW choice (`PATCH /api/me` → 400 "Pick one of the characters"; `lobby:cosmetics` → `error invalid` same text); null / retired v1 presets / 'storyteller' / NPC ids are refused. New accounts get a random playable character. Accounts stored before v2 still sign in and join. No two PLAYERS of one lobby share a character: on join (and when a Storyteller becomes a player) a missing / invalid / taken character is replaced, for that lobby only (the account is not rewritten), by the first free playable id scanning the roster from an offset hashed from lobbyId + pid; `lobby:view` shows the result. `lobby:cosmetics` with a character another player holds → `error invalid "<Name> already took <Character> — pick another"`. The Storyteller always renders as the 'storyteller' sprite, so their own pick blocks nobody and they may pick any playable character; it is re-checked when they become a player (release / transfer). Layered cosmetic fields stay in the schema and are ignored.
  - **Voice:** outdoors is always the `square` zone (no `street` proximity); tests updated. The coordinator's street-attenuation branch in `audienceOf` is now dead code (kept, harmless).
- 2026-10-15 (v2 social / notebook / records / story, logged by lead), additive:
  - **Social** (`packages/protocol/src/social.ts`): C2S `social:emote` (point at x,y / a visible pid), `social:pin` (place or person, one of 8 `PIN_COLORS`), `social:unpin`, `social:clearPins` ('all' = ST only); S2C `social:emote` only to viewers who can see the emoter; `WorldSnapshot.pins` = pins of the viewer's current location (person-pins only while the target is visible; omitted only when empty). Max 6 pins/member (oldest evicted); night pins are deleted at dawn (visit secrecy). Server: apps/server/src/social.
  - **Notebook** (`notebook.ts`): owner-only private notebook per (match, account), C2S `notebook:save {matchId, rev, data}` / `notebook:load`, S2C `notebook:data` (load / saved / newer) and `notebook:unavailable`; ≤ 20 KiB; WebSocket `maxPayload` raised 4 KiB → 24 KiB for it (apps/server/src/app.ts). Deleted with the account.
  - **Game records** (migration 3 `match_records`, docs/game-records.md): one versioned JSON record per game (finished or abandoned) incl. a play-by-play `timeline`; admin `GET /api/admin/games[/:id]`.
  - **Story** (`story.ts`): the ST's private play-by-play (`story:get` → S2C `story:st`), optional pamphlet release (`story:release` → S2C `story:pamphlet` to everyone; `story:pamphlets` re-fetch). Mid-game pamphlets only if `StSettings.pamphlets` (default **false**) and built from public events only; the final story (full reveal) only after the end is confirmed.
  - **Admin console**: `/api/admin/*` (accounts, lobbies, games, audit log; migration 2 `admin_audit`).
