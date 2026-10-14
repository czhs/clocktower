# Clocktower Town — Private Multiplayer Prototype

> **Status:** Implementation specification for a Claude Code agent team. Build an actual working game; do not stop at scaffolding, mock screens, or design documents.
>
> **Scope:** Private, invitation-only prototype for a small group of friends. The game can closely follow Blood on the Clocktower's Trouble Brewing mechanics for private personal experimentation; do not publish, redistribute protected art/text/role data, or market it as an official game without the rights holder's authorization. All visual assets for this implementation must be original.

## 0. Decision summary (use these defaults without reopening the architecture discussion)

- **Game:** Browser-based, top-down 2D pixel-art social-deduction town, inspired by the *physical staging* of Minecraft Blood on the Clocktower and the lobby experience of Town of Salem.
- **Scale:** At least 5–15 players **per lobby**, plus one separate Storyteller seat. Multiple lobbies can run on the same server concurrently. Make max concurrent rooms configurable; default 4 and load-test at least two rooms simultaneously with 15 players + Storyteller each. Actual capacity is bounded by host bandwidth/CPU and voice plan limits; measure it instead of promising unlimited scale.
- **Primary host, development AND production:** User's RTX 3060 PC, reachable on the existing Tailscale network as **`hshi-u1`**. Run both dev and production application servers on `hshi-u1` as isolated services with separate ports, databases, configs, logs, and build artifacts. **Claude Code agent fleet / code orchestration:** `hshi` (RTX 4090), accessing `hshi-u1` remotely over Tailscale SSH. **The Mac is not a host** for this project. Detect `hshi-u1`'s actual OS and runtime before choosing any OS-specific commands.
- **Free public ingress:** **Tailscale Funnel on `hshi-u1`** to its own production HTTP server on `127.0.0.1:3000`; do not expose the development service. Players **do not install or sign up for Tailscale**; they open a public HTTPS `*.ts.net` URL. No ngrok, router port forwarding, purchased domain, or paid hosting service required. Funnel has bandwidth limitations and is a public endpoint; provide a configurable fallback ingress if needed, but implement Funnel first. The developer connects privately through Tailscale SSH and an SSH port forward to `hshi-u1`'s dev service on `127.0.0.1:3001`.
- **Voice:** **LiveKit Cloud free Build tier** for WebRTC media, not via Funnel. Currently advertises 5,000 WebRTC participant-minutes per month, 100 concurrent connections and 50 GB downstream transfer; verify during implementation. Build a visible usage dashboard, quota warnings, and graceful voice-unavailable behavior. This is free *within the quota*, not unrestricted free voice. Keep provider credentials on the server only.
- **Stack:** TypeScript pnpm monorepo; Phaser 3 (or compatible maintained Phaser release), Colyseus authoritative multiplayer server, Node.js, SQLite + Drizzle, LiveKit WebRTC, Tiled-compatible JSON maps, procedural original PNG pixel assets with Python/Pillow or a deterministic TS generator; Vitest + Playwright.
- **Access:** No lobby passwords. Lobby browser and joining require a signed-in account; accounts use a generated high-entropy passphrase with **no username/email for login**. Display names are cosmetic and need not be unique.
- **Storyteller:** Human-controlled, visible character, night visits inside assigned homes, private Grimoire and manual adjudication controls. **Do not replace human Storyteller with an AI or fully automated narrator.**

## 1. User experience

### 1.1 Account entry

1. On first visit, choose **Create Account** or **Sign In**.
2. Create Account generates a memorable, cryptographically random multiword passphrase (target >= 70 bits of entropy). Show once, offer copy, and explain that it is the credential and cannot be recovered unless a separate recovery mechanism is explicitly implemented. Never store plaintext passphrases or send them to analytics/logs.
3. Sign In accepts only the passphrase; there is **no account username**. A user may choose a nonunique in-game display name separately.
4. Persist display name, cosmetic presets, lifetime stats, and account-level settings (mic preferences can be device-local).
5. Session cookies must be HttpOnly, Secure, SameSite, with sensible expiry; store a strong passphrase hash, rate-limit sign-in, and validate all server mutations.

### 1.2 Lobby browser and multiple lobbies (**critical new requirement**)

The landing page after sign-in shows a **live lobby finder**:

- List **all publicly joinable lobbies on this game server**, with name, occupancy (`players/15`), available Storyteller seat or named Storyteller, phase (`Waiting`, `Starting`, `Day`, `Night`, `Finished`), selected script, and approximate ping where feasible.
- Search by name and filter by Waiting/All, player count, and script. Default sort: joinable first, then most occupied, then most recent.
- **Create Lobby:** choose lobby name, `maxPlayers` (5–15), script (initially Trouble Brewing), optional lobby description, and whether to take the Storyteller seat immediately. **No password/PIN/invite code is required.**
- **Join Lobby:** one-click joining of a waiting, non-full lobby; lobby member list, Ready button, cosmetic preview, optional text chat, Start button for Storyteller.
- Players cannot join as participants once a match has started, except for authenticated reconnection to their previously assigned seat. Mid-game spectating is disabled by default to avoid information leakage.
- Lobby links can be shared as `https://<funnel-host>/lobby/<public-id>`; links are convenience, **not security credentials**.
- Each lobby has its own authoritative Colyseus room, Storyteller identity, roles, hidden information, map/player positions, votes, game clock, night queue, and **separate LiveKit room**. No cross-lobby chat, voice, messages, or hidden-state leakage.
- The lobby host has administrative powers in **that lobby only**. The Storyteller seat can be transferred explicitly while waiting; ensure players cannot seize it by submitting client events. Storyteller is not counted in the 5–15 player capacity.
- Support multiple simultaneous waiting rooms and matches. Clean up empty lobbies with an inactivity timeout, but do not destroy a running game on brief disconnects.
- Refresh updates lobby occupancy and phase in real time over a dedicated directory channel; periodically resync as fallback. Handle duplicate joins and rapid create/join/leave races atomically.
- Lobby names/display names must be escaped in UI; enforce reasonable length and content limits. A public lobby does not mean unauthenticated users get internal lobby state.

### 1.3 Main game world

- Single distinctive hand-designed town, approximately 96 x 96 tiles at 16 px/tile (adjust once tested): prominent central clock tower, circular paved town square, 15 player cottages, tavern, chapel, graveyard, garden, alleys, streetlights, distinctive landscape silhouettes.
- Scene includes interiors with doors, walls, colliders, lighting, and furniture. Assign one house to each player. For 5–14 players, unassigned houses are decorative/visitable under normal rules.
- Move by WASD/arrows, smooth animation, collision and camera follow. Responsive at reasonable browser sizes. Server validates movement speed, collision, house-access constraints, and phase constraints. Client-side prediction/interpolation permitted.
- Cosmetic sprites: base skin, hair, outfit, palette, accessories, and visual ghost variant. Produce the actual original sprite sheets in the repo; not placeholder geometry.
- Out of game, a player may edit appearance; during a match, preserve player identity, avoid cosmetic changes being used for deception that bypasses in-game mechanics.
- Show player display name, current phase, in-game reminders, voice status, voting status, and role info visible only to that player.

### 1.4 Spatial voice, square broadcast, and private conversations

- In the **town square circle**, every participant inside the circle hears every other participant inside at normal conversational volume, regardless of distance within that circle.
- **Outside the square**, voice attenuates by distance with an audible radius; add hysteresis/brief smoothing across thresholds to prevent popping.
- **Inside rooms/buildings**, audio is localized: same room hears one another, walls/doors block outside audio. Closing a door may change the acoustic zone. Storyteller has controlled announcement ability.
- **Night:** All players isolated in their respective homes. When Storyteller enters one player's home for an action, only the Storyteller and that player can hear the visit; non-visited players must not learn who is being visited via audio, movement or protocol messages.
- Use **LiveKit room-per-lobby** with additional private audio isolation for homes/night visits as necessary. A client-side volume slider is **not a privacy boundary**. When private speech is intended, enforce room/channel eligibility in the service/token/subscription architecture, revoke access on departure, and test unauthorized subscriptions. Outdoor proximity audio is spatially attenuated; document any remaining limits against modified clients.
- Never simply hand all clients a general room token with unrestricted subscription and call a client-side mute algorithm "secure private audio." LiveKit defaults permit subscription to all published tracks; design with explicit privacy enforcement for genuinely private rooms.
- Push-to-talk, mute/unmute, input device picker, speaking indicators, individual volume, deafening, permission error UI, reconnect, and debug overlay.
- Browser requires user gesture for audio and microphone permissions; display a clear enable-voice control. Don't block users from joining when microphone is unavailable (text participation should still work).
- Do **not** self-host LiveKit only behind a TCP HTTPS Funnel and claim media works: WebRTC requires appropriate UDP/TURN connectivity, and Funnel does not expose general UDP.
- Voice quota must be surfaced to admin. Budget participant-minutes = number of connected participants x real-time duration. For 16 concurrently connected participants, 5,000 minutes permits ~312.5 minutes/month total at that size (about 5.2 hours), before any other sessions consume quota.

### 1.5 Phases and Storyteller visits

- **Day:** players walk, talk, gather, hold private discussions, nominate, and vote. Storyteller controls announcement/nomination flow and the transition to night.
- **Bedtime:** bell rings; players have configurable time to walk to their own homes. Provide automatic return when the countdown expires. A graphical transition hides other houses' night activity.
- **Night:** regular players cannot see the external map, Storyteller travelling, other houses, or unrelated private actions. Storyteller sees the town and a night-order checklist, physically walks to the correct home, enters, and interacts privately with the occupant. Actual action resolution is server-authoritative; walking is presentation, not the rule resolver.
- Storyteller can accelerate walking/travel, skip/resolve visits, adjust decisions, send prompts, provide manual information, manage role changes, and correct mistakes without disclosing private details. No player learns visit order from rendering network events.
- **Dawn:** resolve actions consistently, publish permitted announcements, update alive/dead status, and resume day.
- Rejoining mid-night restores the correct house, private state, night-prompt state and voice eligibility without exposing anything else.

### 1.6 Complete Trouble Brewing rules (personal use)

Implement the 22 Trouble Brewing characters and 5–15 player setup distributions, night orders, first-night behavior, poison/drunk information, Demon mechanics, protection, registration ambiguity, votes, execution, victory triggers, and human Storyteller adjudication. Use modular role definitions and a pure rules engine for unit testing. Implement exact game mechanics and role interactions in the private environment; don't distribute copied rulebook text, illustrations, logo, or publisher art.

Critical interaction tests include Imp self-kill/transfer, Scarlet Woman, Monk/Soldier, Drunk, Poisoner, Ravenkeeper, Spy/Recluse registration, Virgin, Slayer, Saint, Mayor, and nomination limitations. The Storyteller must have manual override where judgment is essential. No private Grimoire data should ever reach normal participant clients.

Dead characters receive a distinctive ghost appearance. Dead players can talk during the day, cannot nominate, and have a one-use ghost vote. HUD clearly shows `Alive / Dead`, `May nominate?`, and `Ghost vote available/spent`. All state transitions enforced on server.

### 1.7 Stats and persistence

Track matches played/completed, wins/losses, role history, alignment wins, nominations, executed/dead status, ghost votes, and optional cosmetic achievements. Make stats updates **idempotent** so disconnections or duplicate events cannot double-count wins. Store game results in durable SQLite transactions.

## 2. Architecture and project layout

```text
clocktower-town/
├── apps/
│   ├── client/             # Phaser, login, browser UI, lobby finder, town, ST UI
│   └── server/             # Node, Colyseus, directory, accounts, game hosting
├── packages/
│   ├── protocol/           # Zod schemas, event DTOs, permission-safe views
│   ├── rules/              # pure rules and role plugins
│   ├── voice/              # acoustic graph, LiveKit access, controls
│   ├── assets/             # generated PNG/atlas/tiles/map + regeneration scripts
│   └── db/                 # Drizzle schema, migrations, account/stats repositories
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── load/
├── scripts/
│   ├── dev.sh
│   ├── deploy-hshi-u1.sh
│   ├── smoke-test.sh
│   └── verify-public-endpoint.sh
├── docs/
│   ├── architecture.md
│   ├── progress.md
│   ├── deployment.md
│   └── test-results.md
├── .env.example
├── CLAUDE.md
└── package.json
```

Suggested application boundaries:

- LobbyDirectoryService: database-backed or in-memory index of Colyseus rooms with authoritative capacity and join transactions. Don't allow two lobbies to share IDs or rules state.
- GameRoom: one active Colyseus room per lobby; authoritative user identity/seat mapping and lobby lifecycle.
- RoleEngine: pure state transition/action functions with a strict distinction between server-only state and per-viewer projections.
- VoiceCoordinator: server-derived acoustic membership, LiveKit room identity and permission grants, voice room changes, quota logging.
- AccountService: passphrase-only identity and session cookies. Every API method that changes a lobby/game requires authenticated identity and privilege checks.
- Persistence: SQLite with WAL, migrations and backups. Keep separate SQLite files for dev and prod on `hshi-u1`. Don't require Redis, Postgres or a cloud DB for this single host.

## 3. Host and network setup

### Primary deployment (free): both environments on `hshi-u1`

1. **Discover/verify the machine.** From `hshi`, connect to the Tailscale hostname `hshi-u1` via SSH (using whatever SSH credentials/config are already authorized). Confirm actual OS, shell, architecture, available CPU/RAM/disk, Node/pnpm, Tailscale version, service manager and free ports. **Do not assume that `hshi-u1` runs macOS or Linux; do not change any unrelated machine services.** If SSH is unavailable, record the precise blocker without pretending access is working.
2. **Developer workflow:** Claude Code and agent orchestration remain on `hshi` (RTX 4090). Deploy/sync code to `hshi-u1` over authenticated Tailscale SSH / an existing private Git remote. **Build and execute the development game server on `hshi-u1`** (not on the Mac or `hshi`). Use a separate dev checkout/worktree or deployment directory and run tests against that service. Do not copy incompatible native `node_modules` from another machine; install/build in the target environment.
3. **Development instance:** Bind `127.0.0.1:3001` on `hshi-u1`. Use isolated `.env.development`, development DB, development secrets, LiveKit room namespace and logs. Access privately from `hshi` using `ssh -L 3001:127.0.0.1:3001 hshi-u1` (adjust SSH invocation for the actual environment). Serve client/API/WebSocket over the same dev origin. **Never expose the dev port through Funnel** or allow dev database migrations to touch production.
4. **Production instance:** Bind `127.0.0.1:3000` on `hshi-u1`, using an independent release directory, `.env.production`, SQLite production DB, session secret and logs. Serve SPA/static assets, API, login, lobby directory, and Colyseus WebSockets through one HTTP port. Ensure WebSocket Upgrade and forwarding headers work. Production deploys should target an exact tested Git commit and restart **only** production, leaving dev running.
5. **Public HTTPS:** Run Tailscale Funnel on **`hshi-u1`**, not `hshi` or the Mac. Enable MagicDNS, HTTPS certificates and Funnel permission if needed; configure `tailscale funnel --bg 3000` using installed CLI semantics and inspect `tailscale funnel status`. Public link should be `https://hshi-u1.<tailnet>.ts.net` if Tailscale retains that device name; don't guess the actual hostname. Friends open the URL in any browser without installing Tailscale. Funnel accepts public HTTPS/WSS and forwards only to local **production port 3000**.
6. **Voice:** Use external LiveKit Cloud free tier for WebRTC audio, not Funnel. Backend issues short-lived, lobby-scoped tokens. For development use a separate LiveKit project if the free plan permits; otherwise namespace room IDs and credentials appropriately. Do not allow development clients to access production voice rooms. Quota is shared when using one LiveKit Cloud project.
7. **Process supervision and isolation:** On Linux prefer separate `systemd` service units (e.g. `clocktower-dev` and `clocktower-prod`), otherwise select OS-appropriate restart-on-failure supervisors after detecting `hshi-u1`'s OS. Isolate working directories, state, environment variables, DB backups and logs; ensure neither instance can silently interfere with the other. Production Funnel persists through reboot; the app also auto-starts. Avoid root privileges where not required.
8. **Frontend config and verification:** Client HTTP/WebSocket URLs derive from `window.location` (HTTPS -> WSS); never hardcode `localhost` as the public endpoint. Verify production from a truly external browser/network using HTTPS, WSS, microphone permissions and lobby creation. Verify private dev via SSH forwarding and make sure the dev port is not reachable publicly. Perform at least two simultaneous 15-player-plus-Storyteller lobby tests on the target `hshi-u1`, capturing real CPU, memory, latency, and network load. Document Funnel bandwidth behavior.

**Separation invariant:** `hshi` = coding/agent controller; **`hshi-u1` = both dev game server (private port 3001) and production game server (publicly tunneled port 3000)**. Mac = no part of this deployment. Both runtime environments must survive independently when the other is rebuilt or restarted.

### Why not alternatives?

- **Plain Tailscale Serve** requires each friend to be on your tailnet; not suitable for frictionless public lobby browsing.
- **ngrok** is valid for testing but not the primary solution because a simple stable free Funnel URL is already available with Tailscale on `hshi-u1`.
- **Cloudflare Tunnel** is another valid HTTP/WSS option, especially with a controlled domain, but not required here.
- **Self-hosting LiveKit behind HTTP-only tunnel** cannot correctly expose WebRTC media without public UDP/TURN connectivity. LiveKit Cloud free tier is the fastest working approach for the private prototype. Abstract the voice provider so you can later switch to self-hosted LiveKit with proper UDP reachability if usage grows.

### Required environment variables

Use `.env.example` without secrets, and separate untracked `.env.development` / `.env.production` **on `hshi-u1`**, e.g. `PORT`, `DATABASE_URL`, `APP_PUBLIC_ORIGIN`, `SESSION_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LOBBY_MAX_COUNT`, `PLAYER_MAX_PER_LOBBY`, and other required values. Never log secrets, passphrases, LiveKit admin credentials or complete hidden-state objects.

## 4. UI screens

1. Welcome / Create Account / Sign In (passphrase-only).
2. Account home with cosmetic editor, stats, and **Lobby Finder**.
3. Create Lobby modal with name, player cap, script, Storyteller option, and Create button. **No lobby password field.**
4. Waiting Lobby: players, ready states, Storyteller seat, lobby details, share URL and start.
5. Game: pixel town, phase/status HUD, voice controls, player info, nomination/voting UI.
6. Storyteller overlay: Grimoire, night-order workflow, action selection/results, manual overrides, phase controls and lobby management.
7. Endgame results with reveal and per-account stats updates, rematch/new lobby controls.
8. Admin/status: voice quota usage, game/server health, errors; not publicly accessible.

## 5. Agent team: actual orchestration required

Start Claude Code Agent Teams and create **five distinct teammates**; lead owns the protocol, integration, and shared decisions.

| Teammate | Exclusive primary ownership | Deliverables |
|---|---|---|
| `rules-storyteller` | `packages/rules`, rules services, Storyteller UI | role interactions, night order, nominations, voting, death, victory, ST controls |
| `world-art` | Phaser scenes, `packages/assets` | world, interiors, movement, generated sprite sheets, cosmetics, ghost skins |
| `lobby-auth` | server directory, room lifecycle, identity, DB | multi-lobby finder, create/join/reconnect, passphrase accounts, stats, persistence |
| `voice` | `packages/voice`, voice client | LiveKit, acoustic rules, isolation, quotas, device controls |
| `qa-deploy` | tests/scripts/deploy docs | integration harness, synthetic players, load/security tests, isolated dev + prod services on `hshi-u1`, Funnel deployment |

Lead must declare TypeScript message contracts and source ownership first. Share only the stable contracts. Work in clearly separated modules/branches or worktrees; teammates should communicate changes and avoid simultaneous edits of common files. At integration points, lead merges and resolves conflicts.

## 6. Milestones and acceptance tests

**M0 — Contracts and skeleton**
- Monorepo builds; docs and protocol types exist; team tasks assigned and responsibilities announced.
- `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm serve` declared and functional as appropriate.

**M1 — Accounts + multi-lobby + town vertical slice**
- User can create/passphrase-sign-in, browse/create/join public no-password lobbies.
- Two independent lobbies exist simultaneously; occupants of A cannot see players, state or hidden events of B.
- Each lobby has 5–15 player cap + Storyteller, synchronized movement, collision, houses, configurable cosmetics.
- A user can leave Lobby A and join Lobby B; count updates and stale seats expire safely; authenticated reconnect restores the same seat.

**M2 — Voice**
- Real LiveKit free project configuration works with external browser users.
- Full-volume square gathering; distance falloff on streets; same-room audio; separate-house/night-visit isolation.
- Security tests attempt unauthorized subscriptions and token reuse across lobbies.
- Acoustic transitions don't pop and voice reconnect works; monitor usage quota.

**M3 — Playable Storyteller-guided round**
- Lobby ST starts round; day/night loop, bedtime, ST physical visits, prompts, announcements, nominations, executions, deaths and ghost votes work with manual adjudication.
- Two running lobbies can be in different phases without interference.

**M4 — Complete Trouble Brewing rules**
- All 22 roles, setup, action order and interactions tested; victory states and Storyteller overrides validated.
- Server-only Grimoire and role secrecy tested in packets, APIs, and client state.

**M5 — Art, polish, final deployment**
- Original cohesive art files and regeneration script committed; distinct houses and animated player/ghost cosmetics.
- `hshi-u1` runs separate dev and prod releases; the production release builds/starts successfully, enables Funnel, and serves external HTTPS/WSS clients; the dev service remains private.
- End-to-end test using two browsers and a separate mobile network against production on `hshi-u1`, plus a load test of at least two active 15-player-plus-Storyteller lobbies and concurrent voice within the free limits.

### Failure/edge-case coverage

- Duplicate account sign-in from multiple devices (define policy), room join races, Storyteller disconnected, full lobby, role actions interrupted by refresh, midnight reconnect, ghost vote already spent, player count below 5, stale lobby listing, two matches with same display name.
- Voice denied/no microphone, muted participant, LiveKit quota exhausted, public ingress outage, `hshi-u1` restarts, temporary packet loss, privacy across closed doors and lobby boundaries.
- Ensure no spectator or arbitrary browser API can obtain the Grimoire, role list, hidden targets or night-visit schedule.

## 7. Execution discipline

- **Implement, don't merely propose.** Start by checking local tool versions and existing repo contents. If repo exists, preserve user changes, inspect before modifying. Don't ask the user to approve each routine technical decision.
- Build a **complete small vertical slice first**: authentication -> two lobbies -> two moving players in different rooms -> one functional voice chat -> Storyteller-initiated night visit. Then scale/refine.
- Prefer working implementations over 100% conceptual feature breadth, but don't declare success before meeting each acceptance criterion.
- Record actual commands run and pass/fail results in `docs/test-results.md`. Never invent passing tests or publicly accessible URL.
- Provide a precise list of external configuration needed (e.g., creation of LiveKit free project, enabling Funnel) without exposing tokens in chat.
- Maintain `docs/progress.md`, including completed, blocked, and next steps. Escalate only truly blocking missing credentials, machine access, or required user actions.
- The game must be playable in the browser. Finish with the exact tested build/deploy commands and the Funnel URL **only if actually obtained from `hshi-u1`**.

## 8. Relevant primary documentation

- Tailscale Funnel: https://tailscale.com/docs/features/tailscale-funnel
- Tailscale Funnel CLI and background mode: https://tailscale.com/docs/reference/tailscale-cli/funnel
- LiveKit Cloud pricing/quotas: https://livekit.com/pricing
- LiveKit WebRTC firewall requirements: https://docs.livekit.io/transport/self-hosting/ports-firewall/
- LiveKit subscription control and access defaults: https://docs.livekit.io/transport/media/subscribe/ and https://docs.livekit.io/transport/media/publish/
- Phaser documentation: https://docs.phaser.io/
- Colyseus documentation: https://docs.colyseus.io/

