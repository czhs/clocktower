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
| `chat:message` | GameRoom + `voice.audienceOf` | Same audience as voice, in EVERY phase (waiting / finished too, since v2.2.1). |
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
- 2026-10-15 (auto-st, v2.1 town clock + automatic games). Protocol changes are all additive; the contract is `clock.ts`, written by the lead. Design: docs/auto-storyteller.md.
  - **`lobby.ts`:** `LobbySummary.storytellerMode?` is always set by the server. `LobbySummary.autoTimings?` is set only in auto mode.
  - **`messages.ts`:** new C2S `lobby:abort` (`EmptyMsg`). Only the host of a running automatic game may send it. The game is recorded as abandoned with `abandon.reason 'aborted_by_host'` and the lobby returns to the waiting room. Human games answer `forbidden`.
  - **Views:** `clock` and `storytellerMode` are now filled in every player and Storyteller game view. The bedtime countdown is mirrored as stage `'bedtime'`. The human Storyteller's `day_clock` is a prop that is cleared when the day ends and is not undoable.
  - **Server:** `GameModule` gains optional capabilities `configureMode` / `handleClock` / `storytellerMode`. These live in the extension interface `AutoCapableGame` in apps/server/src/auto; `modules.ts` is unchanged. `GameRoom` changes:
    - an auto lobby has no Storyteller seat; a `storyteller` intent joins as a player, and claim / transfer are refused;
    - the host starts the game;
    - `lobby:settings` takes `storytellerMode` / `autoTimings`;
    - `clock:*` messages are routed to the game module;
    - the stats `storytellerAccountId` and `MatchMeta.storyteller` are null in auto mode.
  - **Directory:** `LobbyInit.storytellerMode`. A ticket with intent `storyteller` for an automatic lobby is checked like a player ticket.
  - **`@ct/rules`:** optional `GameState.adjudicator` (`Adjudicator`: `spyRegistersAsTownsfolk`, `recluseRegistersAsDemon`, `enforceButler`). It is never serialised or snapshotted. When it is absent, the engine behaves exactly as before (alerts for the ST).
  - **Records:** `AbandonReason` gains `'aborted_by_host'`. The recorder's `NOT_UNDOABLE` gains `'day_clock'`. Automatic decisions are timeline entries of kind `storyteller` with `data.auto: 'fate' | 'clock'`, and the first one carries the seeds.
- 2026-10-15 (world-art, v2.2 Nick Song), additive: roster gains the villager `nicksong` ("Nick Song"; `@ct/assets` `CAST`/`PLAYABLE_IDS`, so `Cosmetics.preset: 'nicksong'` is now valid). **`social.ts`:** `EMOTES` gains `'nick-face'` (so `EmoteKind` / `EmoteEvent.kind` too); C2S `social:emote` accepts `{ kind: 'nick-face' }` (no coordinates); new constants `NICK_FACE_MS = 3000`, `NICK_FACE_CHARACTER = 'nicksong'` (mirrored in `client.ts`). Server (apps/server/src/social): only a non-Storyteller member whose lobby `cosmetics.preset` is `nicksong` may send it (else `error {code:'invalid', for:'social:emote'}`), same emote rate limit; S2C `social:emote {pid, kind:'nick-face', x, y = the emoter's position, at}` goes only to members who can currently see him (the pointing visibility rule). Client: his head + hair are hidden (sprite crop) and the `nick_face` frame of social.png (meta `anchors.nick_face`, `meta.nickFace {cropY, neck}`) is drawn on his neck for `NICK_FACE_MS`.
- 2026-10-15 (rules-storyteller, st-qol), additive, Storyteller view only: `StorytellerGameView.undoLabel?: string | null` — what `undo_last` would revert ("kill Alice", "bedtime bell"; `@ct/rules` `commandLabel`, stored as `HistoryEntry.label`). `NightStepView.falseInfo?: InfoSpecInput` — for an unfinished drunk / poisoned info step (and the Drunk), a ready-made plausible false info from the automatic Storyteller's fate rules (`apps/server/src/game/falseInfo.ts`, RNG seeded from the night + step + choice, so stable between views and never touching the game RNG); advisory, the ST may send it, the truth or anything else. Neither field is in any player projection (tests: `packages/rules/test/st-qol.test.ts`, `apps/server/test/st.qol.test.ts`). Automatic games add PUBLIC `announce` lines explaining the automatic Storyteller (night: answer at home within N s / dawn after at least N; day plan; "X may speak in their defence: the vote starts in N"; day over; bedtime overtime) — public facts only (`apps/server/test/auto.qol.test.ts`).
- 2026-10-15 (lobby-auth, v2.2 simple lobby names), additive: new zod-free `packages/protocol/src/lobbyWords.ts` (re-exported by `index.ts` and `client.ts`): `LOBBY_ADJECTIVES` (68), `LOBBY_NOUNS` (149), `WORD_LOBBY_ID_RE`, `LOBBY_ID_RE` (`/^[A-Za-z0-9_-]{4,32}$/`, unchanged acceptance), `wordLobbyId()`, `wordLobbyName()`, `normalizeLobbyId()`. **Lobby id format:** new lobbies get `<adjective>-<noun>-<noun>` ids (lowercase, e.g. `amber-fox-lantern`, <= 23 chars, ~1.5M combinations), unique among live lobbies and not reused for 1 h after removal (`RETIRED_LOBBY_ID_MS`; covers stale links, reconnect tokens and per-lobby LiveKit rooms/audits); a random 10-char id remains the fallback. Lobby ids are public (every lobby is listed), never a credential. Every existing id regex (route, HTTP, admin, voice room naming) already accepts both formats. `GET /api/lobbies/:id` and `POST /api/lobbies/:id/ticket` resolve the id exactly first, then case-folded for word ids (`Amber-Fox-Lantern`); the ticket's `lobbyId` is the canonical id. `POST /api/lobbies` with a missing/blank `name` gets a default `<Adjective> <Noun>` name (non-string names still 400).
- 2026-10-15 (lobby-auth, v2.2 account stats), additive: **`auth.ts` `StatsView`** (`GET /api/me/stats`, session cookie, `Cache-Control: no-store`, now rate-limited per account 20 burst / 0.5 s⁻¹) gains `gamesAbandoned`, `winRate` (wins/(wins+losses), null before the first result), `goodGames`, `evilGames`, `topCharacters: CharacterTally[]` (≤3, finished games), `favouriteAvatar {avatarId, games} | null`, `currentWinStreak`, `bestWinStreak`, `recentGames: RecentGame[]` (≤5, played or told, finished or abandoned; in-progress games excluded). New exported types `CharacterTally {character, games, wins}` and `RecentGame {matchId, endedAt, lobbyName, as: player|storyteller, status: finished|abandoned, character, alignment, avatarId, winner, result: won|lost|told|abandoned}`. Only the session's own account; never other players' ids/names/characters; for an abandoned game `character` is the believed character (no final reveal, so a Drunk sees their Townsfolk). Abandoned games never count as wins/losses. **DB migration 5 `account_stats`:** `match_players.avatar_id` (written at game start by GameRoom, backfilled from `match_records` seats) + index `match_records_storyteller_idx (storyteller_account_id, ended_at)`. Client: `apps/client/src/ui/lobby/StatsPanel.tsx` under the Lobby finder (styles in lobby.css `.ct-rec*`); the old side-column "Record" panel is replaced.
- 2026-10-15 (rules-storyteller, v2.2 storylines + Storyteller prepare), additive:
  - **New zod-free `packages/protocol/src/storylines.ts`** (re-exported by `index.ts` and `client.ts`): `TB_DISTRIBUTION` / `tbCounts(n, withBaron)` (the Trouble Brewing table; `@ct/rules` `SETUP_TABLE` now aliases it), `STORYLINE_IDS` / `StorylineId`, `StorylineDef`, `STORYLINES` (7 presets), `storylineById`, `storylineProblem`, `storylinePlayerCounts`, `formatCounts`, `buildStorylineBag(def, n, rng, CHARACTER_INFO)`.
  - **`storyteller.ts`:** StCommands `deal_preset {storyline, seed?}`, `deal_bag {characters, drunkBelieves?, demonBluffs?, allowNonstandard?, seed?}` (setup phase; the server shuffles the bag onto the seats), `prepare {prepare: StPreparePatch}` (waiting room only: `deal: manual|random|storyline`, `storyline`, `bedtimeSeconds`, `settings`). `StorytellerGameView.deal?: DealInfo | null` (`{method: random|storyline|bag|manual, storyline?}`). Types `DealInfo`, `StPrepareView`, `StPreparePatch`, `PREPARE_DEALS` (mirrored in `client.ts`).
  - **`lobby.ts`:** `LobbySummary.autoStoryline?: 'random' | 'secret' | StorylineId` (automatic lobbies; secret unless the host announces); `LobbySettingsMsg.autoStoryline?: StorylineId | null`, `autoStorylinePublic?: boolean` (host, waiting); `LobbyRoomView.stPrepare?` (ONLY in the seated Storyteller's own view) and `autoStorylineChoice?` (ONLY in the auto host's own view).
  - **Server:** GameRoom lets `st:command {type:'prepare'}` through while waiting (checks in the game module), passes `{storyline}` to `configureMode`, and adds the two private view fields. `AutoCapableGame.configureMode(mode, timings, extras?)` + optional `prepareView()`. Records: `SetupRecord.method` gains `storyline | bag`, `SetupRecord.storyline?`; timeline `storyteller` entries for `deal_preset` / `deal_bag`. Docs: docs/auto-storyteller.md §3.
- 2026-10-16 (integration, v2.2.1 — merged Isaac's GitHub `main`: PR #2 43d1c0f/f44fb58/cafb858, PR #3 b9c2833):
  - **Chat scope (behaviour change, no schema change):** `GameRoom.handleChat` delivers to the sender's voice audience (`voice.audienceOf`) plus the sender in every phase, including `waiting` and `finished` — there is no lobby-wide waiting-room chat any more. Player messages are scope `'zone'` (Storyteller: `'storyteller'`); `ChatScope 'lobby'` stays in the schema as a legacy value the server no longer sends (`chat.ts` comment). The waiting-room chat panel is now "Nearby chat". testkit's fake voice module defaults to "everyone hears everyone" (`room.test.ts` covers waiting/day/finished privacy).
  - **HD cast (additive):** `CastMember.hd?: boolean` and `CAST_HD_SCALE = 5` in `@ct/assets` (`src/cast.ts`, re-exported). New villager `brianbi` (hd; roster 28 playable = 15 villagers + 13 mascots). New atlas `generated/cast-hd.{webp,png,json}` (`scripts/cast/hd.ts`, written through `scripts/lib/encode.ts` like every atlas; manifest `{scale, frameWidth:160, frameHeight:200, anchor, directions, frames, walkFps, rows: key -> first row}`; ghosts have one idle row). Runtime URL `castHdUrl` in `@ct/assets/runtime`. cast.png / the portrait strip carry a box-filtered 32x40 downscale of hd members. Client: TownScene draws hd keys from `cast-hd` (LINEAR filtering, scale 1/5), castPortrait draws them smoothed.
  - **Client movement:** TownScene adopts the server's sequence after a reload (`seq = max(seq, teleport.seq | snapshot.ackSeq)`; decoded `world:snap2` frames carry `ackSeq`), flushes a `move` before `world:useDoor`, a straight push toward a door enters from up to 20 px (diagonal: 11 px as before; server `DOOR_RANGE_PX` 22), and a tap-to-enter route waits out the door cooldown. Cosmetic townsfolk wander near fixed homes and shy away from visible outdoor Brianbi avatars (`game/npcRoaming.ts`; client-only, never reads hidden state).
  - **Debug hooks** (opt-in `localStorage['ct.debug.camera']='1'`, `__ctCamera`): `avatar(pid)`, `npcs()`, `bubbles()`, `doorBoards()` for e2e.
- 2026-10-16 (v2.3 security, sec-web — WEB-1/3/4/6/7, additive):
  - **`textSafety.ts` (new, zod-free; exported from `index.ts` and `client.ts`):** `INVISIBLE_CHARS`, `MAX_COMBINING_MARKS`, `capCombiningMarks`, `nameSkeleton` (look-alike comparison key), `hasVisibleText`, `cleanMultiline`.
  - **`cleanText` (behaviour):** blank-looking letters (Hangul fillers, Braille blank, …) become spaces, leading combining marks are dropped and mark runs are capped at 3, so invisible-only names/lobby names/chat fail their `min` length.
  - **`storyteller.ts` (behaviour, same shapes):** PromptSpec `title`/`body`, InfoSpec `text`, `kill.cause`, reminder `token`, `announce.text`, `declare_winner.reason` are cleaned (single-line `cleanText` or `cleanMultiline`, which keeps line breaks) before their length caps.
  - **Server:** room display labels de-duplicate on `nameSkeleton` (look-alikes and forged "(n)" suffixes get a suffix); reserved names compare skeletons. Response headers move to `apps/server/src/securityHeaders.ts`: CSP `connect-src` = `'self'` + the exact `LIVEKIT_URL` host, plus `*.production.livekit.cloud` (region fail-over) when it is a LiveKit Cloud URL (never `*.livekit.cloud`); Trusted Types enforced (`trustedTypes` flag in app.ts), COOP/CORP `same-origin` (CORP `cross-origin` for `/og-image.jpg`, `/favicon.png`, `/landing/emblem-*.png`), a fuller Permissions-Policy.
- 2026-10-16 (v2.3 security, sec-secrecy — SEC-1/2/3/7/8; no protocol shape change):
  - **Automatic games (SEC-1):** night info (and the Ravenkeeper prompt) is released at ONE fixed time, nightfall + `promptTimeoutMs`; only Minion/Demon info resolves at nightfall (`apps/server/src/auto/storyteller.ts`).
  - **Engine (SEC-2):** player actions are validated before the pending-result gate: invalid actions get their ordinary error, a prompt answer is recorded, a valid day action while an end is pending is refused and rolled back (`packages/rules/src/engine.ts` `playerAction` / `applyPlayerAction`).
  - **Pins (SEC-3/8):** pins dropped at dawn are ephemeral like night pins; interior pin / point coordinates must lie in (or within 24 px of, then clamped into) that room (`apps/server/src/social/index.ts`).
  - **Abuse (SEC-7):** per-connection protocol-violation score (unknown type, invalid payload, rate-limited non-`move`; burst 150, 10/s) closes the connection with `CLOSE_CODES.abuse` (4105, shared with sec-host's pre-decode frame budget) — `apps/server/src/guard/violations.ts`, hooked in `GameRoom.handleMessage`.
- 2026-10-16 (v2.3 security, sec-host — HOST-04/05/07/09/11; additive except the /healthz body):
  - **`/healthz` (HOST-07 = WEB-5 = AUTH-11):** the public body is now only `{ ok: true }` (`Cache-Control: no-store`). New **`GET /internal/version`** → `{ ok, env, version }` and the existing `/internal/active-games`. Both are answered only to a *local* request (loopback peer and no `X-Forwarded-For` / `CF-Connecting-IP` / `Forwarded`; `apps/server/src/guard/internal.ts`), otherwise a 404. The deploy (`deploy/bin/install-release.sh`, `scripts/deploy-hshi-u1.sh`), `scripts/smoke-test.sh`, `scripts/verify-public-endpoint.sh` and `tests/support/server.ts` (nonce check) read the version there. The install health check falls back to `/healthz` so a rollback to a pre-v2.3 release still verifies.
  - **`CLOSE_CODES.abuse = 4105`** (`messages.ts` + `client.ts`, terminal): shared by the pre-decode per-socket frame/byte budget (HOST-11, `guard/socketBudget.ts`, attached to the ws server in `app.ts`: 2000 frames burst / 200 s⁻¹, 512 KiB burst / 96 KiB s⁻¹; sized for a 60 s TCP-stall flush) and sec-secrecy's violation score (SEC-7).
  - **Admin:** `AdminOverview.system.disk?` `{ dbBytes, freeBytes, totalBytes, level: ok|low|critical|unknown }` (`guard/disk.ts`). sec-ops renders it.
  - **Config:** `HOST_SIGNUP_PER_HOUR` is a server-wide sign-up budget (default 100/h with a burst of 100; 0 = off; unlimited when `APP_ENV=test`). Over budget, `POST /api/auth/create` → 503 `rate_limited` + `Retry-After`.
  - **Server behaviour:** lobby SSE streams are capped at 6 per client address (loopback exempt), and a full pool evicts the heaviest address's oldest stream (`guard/streamSlots.ts`). The game record has a 5 000-entry cap per high-volume list (`GameRecorder.enforceCaps`) and an 8 MiB serialized cap at write (`guard/recordCaps.ts`). HTTP `headersTimeout` is 15 s, `requestTimeout` 30 s, `maxConnections` 2000. The process guard (`guard/process.ts`, installed in `index.ts`) replaces Colyseus' exit-on-any-uncaught-exception: errors are logged, and only more than 3 within 60 s trigger a graceful exit. console.error/warn are capped at 30 lines/min.
- 2026-10-16 (v2.3 security, sec-auth — AUTH-1..10; additive):
  - **`CLOSE_CODES.signedOut = 4106`** (`messages.ts` + `client.ts`, terminal). When an account's sessions are revoked (sign out, sign out everywhere, admin rotate-passphrase or sign-out-all, account deletion, absolute expiry, admin idle timeout, session-cap pruning), the room sends `kicked {reason:'You were signed out'}` and closes the seat's socket with this code. It also rejects any pending Colyseus reconnection, so the token is dead. Waiting room: the seat is released. In a game: the seat is kept, and a fresh ticket after signing in again restores it. The client shows "You were signed out" (`StatusScreen` `signed_out`). Fan-out goes through `apps/server/src/auth/revocation.ts` (`services.revocations`) → `LobbyDirectory.revokeAccount` → `LobbyRoomHandle.revokeAccount`. The same fan-out ends the account's lobby SSE streams.
  - **Join tickets** carry an optional `sid` (first 16 hex chars of SHA-256(session token), not secret). A single-device sign-out closes only the seat that joined with that session.
  - **Auth API:**
    - `GET /api/me/export` returns a JSON download of the account's own data only: profile, session times, stats, match rows, notebooks, and per saved game its own seat, info, prompts, announcements and pamphlets.
    - `POST /api/me/delete {passphrase, confirm:'delete'}` re-authenticates, then returns 409 if the account is seated in a lobby. Otherwise it revokes everything, deletes the account, sessions, notebooks and `account_ips`, and anonymises `match_players`, `matches` and `match_records` (header + JSON, `packages/db/src/repos/scrub.ts`).
    - New `ApiErrorCode` `'reauth_required'`.
  - **Admin:** rotate-passphrase, delete and bulk-delete need a sign-in within the last 15 min **or** `passphrase` (the admin's own) in the body. Otherwise they return 401 `reauth_required`. `GET /api/admin/games/:id` is audited as `game.view` / `game.download` (`targetType:'game'`). Refused admin requests are logged at warn level (`admin access denied`, accountId + path, rate-limited).
  - **Sessions:**
    - `SESSION_MAX_DAYS` (default 90) is an absolute lifetime from sign-in; re-issued cookies never outlive it.
    - Admin sessions end after 12 h idle.
    - Sign-in and sign-up end the browser's previous session.
    - At most 20 sessions per account (oldest pruned).
  - **Passphrase hashing:** new verifiers use scrypt N=2^12. Older verifiers still verify and are re-hashed on the next sign-in.
  - **Sign-in/up abuse limits:** IPv6 is rate-limited per /64 + /56 (4×) + /48 (8×). The scrypt gate allows 2 slots, a 256-request queue, and 4 in flight per range (IPv4 address or IPv6 /48); beyond that it returns 429.
- 2026-10-16 (v2.3 security, sec-voice — VOICE-1..12; additive; spec: docs/security-v2.3/06-voice-cost.md):
  - **`voice.ts`:** `VoiceStatusMsg.wanted?: boolean`. The client sends `wanted:true` as soon as "Enable voice" (or the automatic re-enable after a reload) starts the engine and in every heartbeat, and `wanted:false` when voice is switched off. **The server mints LiveKit tokens only for members that want voice.** A status without `wanted` (a pre-v2.3 tab) counts as wanted. `VoiceRevoke.reason` gains `'disabled' | 'idle'`. `VoiceUnavailable.reason` gains:
    - `'disabled'`: kill switch; grants return by themselves.
    - `'busy'`: a cap was hit; the server retries every 5 s.
    - `'idle'`: voice was switched off; the client turns its voice off and the player presses Enable voice again.
    `VoiceUsageView` gains optional `liveParticipants`, `measured`, `disabled`, `disabledBy`, `disabledReason`, `disabledAt` and `caps`.
  - **Room names** may end in `_<epoch>` (`[a-z0-9]{4,16}`), e.g. `prod-amber_dfox_dlantern-bld-house-3_9f2c4e1a0b`. The server gives a room a fresh name when it empties, and renames every room at bedtime, first_night, night and dawn (members still inside get `voice:revoke phase` + a new `voice:grant`, one short reconnect). Occupied rooms are never renamed because someone left. `parseRoomName` returns `epoch`.
  - **Server:** `apps/server/src/voice/{env,control,ip,reconciler,alerts}.ts`.
    - `config.voice` (VOICE_* env, see `voice/env.ts`): caps (concurrent 64 / per lobby 16 / per IP 4), idle limits (20 min; doubled in game; paused at night), waiting-room voice limit (60 min), `VOICE_DISABLED`, `VOICE_ALERT_WEBHOOK`, and the test-only `VOICE_TEST_AUTO_OPT_IN` (refused with the `prod` prefix).
    - LiveKit usage reconciler + orphan sweep every 60 s, started at boot by `startVoiceBackground(services)` in `index.ts`. Client heartbeats are only a fallback while LiveKit cannot be listed.
    - Kill-switch API for the admin console (sec-ops wires the persisted flag): `voiceControlState()`, `setVoiceDisabled()`, `voiceKill()`, `voiceRestore()`, `configureVoiceFlagStore()`.
    - GameRoom: `RoomAuthData.ipKey` (join IP for the per-IP cap, never sent or logged) and limiter `story:pamphlets` 3 burst / 1 per 10 s.
    - `app.ts`: `cost/staticQuery.ts` answers 400 for query strings on static files (only `/tutorial/*?v=<manifest generatedAt>` passes).
  - **Storyteller announcements:** `voice:announce {active:true}` is sent once; there is no keep-alive any more. The server ends the announcement by itself (90 s without the ST talking, cap `voice.announceMaxMinutes` (default 5), the start of first_night/night/dawn, a home visit) with `voice:revoke announce_end`, refuses to start one at night (`error {code:'phase'}`), and after an automatic end ignores `{active:true}` until the ST sends `{active:false}`.
  - **Test harnesses** that read acoustic zones from `voice:grant` frames set `VOICE_TEST_AUTO_OPT_IN=1` (playtestHarness, e2e playwright.config, tests/security/logs). `world.leaks` passes `limits.autoOptIn` and `roomEpochs:false`.
- 2026-10-16 (v2.3 security, sec-ops — OPS-1/2/6; additive; spec: docs/security-v2.3/07-ops-incident.md):
  - **`moderationShared.ts` (zod-free, mirrored by `client.ts`):** `CHAT_FILTER_MODES = ['off','slurs','strict']`, `DEFAULT_CHAT_FILTER = 'slurs'`, `REPORT_REASONS`, `REPORT_MAX_MESSAGES = 10`, `REPORT_NOTE_MAX = 300`. **`moderation.ts`:** C2S `lobby:mute {pid,on}` and `lobby:unban {key}` (host or seated Storyteller), `report:player {pid, reason, note?, messageIds?}` (any member); S2C `report:ack {ok,message}`; `RemovedMemberView`.
  - **`lobby.ts`:** `LobbySummary.chatFilter?`, `MemberView.muted?` (public), `LobbyRoomView.removed?` (ONLY in the host's / seated Storyteller's own view), `LobbySettingsMsg.chatFilter?` (host, waiting room). `lobby:kick` semantics: host in any phase, seated Storyteller once the game runs; in game the seat stays (disconnected) and no reconnection is allowed; the removal bans the account AND its last network (ipKey; loopback never) from that lobby until `lobby:unban` or the lobby closes (was: 10 min, account only).
  - **Chat:** the server applies the lobby's filter (obscenity, MIT) before delivery, drops a member's identical line within 5 s, caps a lobby at 30 lines/s, drops muted members' lines; every delivered line is kept in a 100-line in-memory ring WITH its audience so a report attaches only lines the reporter received.
  - **`auth.ts`:** `CreateAccountRequest.inviteCode?`; `ApiErrorCode` gains `'suspended' | 'blocked' | 'signups_closed' | 'invite_required' | 'maintenance'`.
  - **HTTP:** `/api` gate (`moderation/gate.ts`) after `mutationGuard`: network blocks (sign-up, sign-in, lobby create, tickets), sign-up mode, maintenance (503 except sign-in/out, `/me`, `/admin`). `requireAccount` refuses suspended accounts (403 `suspended`). Admin API (`moderation/admin.ts`): `GET/POST /api/admin/ops`, `POST /api/admin/ops/revoke-all-sessions`, `POST /api/admin/lobbies/close-all`, `POST /api/admin/accounts/:id/{suspend,unsuspend,block-network}`, `GET/POST /api/admin/ip-blocks`, `POST /api/admin/ip-blocks/remove`, `GET /api/admin/reports`, `POST /api/admin/reports/:id/resolve`; `AdminAccountView.suspended?/networkKnown?`, `AdminOverview.ops?`. Env overrides: `OPS_SIGNUP_MODE`, `OPS_SIGNUP_CODE`, `OPS_MAINTENANCE`, `OPS_MAINTENANCE_MESSAGE`, `OPS_SESSIONS_NOT_BEFORE`.
  - **DB migration 6 `moderation`:** `account_suspensions`, `ip_blocks`, `account_ips` (last network key per account; never logged or sent to players), `ops_flags`, `reports`.
- 2026-10-16 (v2.3, sec-ops — chat UX follow-up, additive): `ChatSendMsg.cid?` (`^[A-Za-z0-9_-]{1,16}$`), echoed as `ChatMessage.cid` ONLY in the sender's own copy (never to others, never in report context). `ServerErrorMsg.code` gains `'muted'` (every send while muted; error replies are rate-limited) and `'duplicate'` (same line within 5 s; at most one notice per 10 s). `chat:send` bucket burst 4 → 6 (2/s), and a `chat:send` `rate_limited` no longer counts toward the SEC-7 violation score. Settings registry: `apps/server/src/settings/**`, `GET/POST /api/admin/settings[/:id[/reset]]` (see docs/deployment.md "Security & limits settings").
