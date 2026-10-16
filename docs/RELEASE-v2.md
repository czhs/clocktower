# Clocktower Town v2.0.0

Public URL: https://clocktower.chrisshi.com (Cloudflare Tunnel → hshi-u1 prod, hardened `clocktower`
system user). v2 rebuilds the town around voice: one compact square where people talk, and private
houses around it.

## The town
- **One small, Town-of-Salem-style town** in the v1 procedural pixel-art style: a circular square with
  the voting circle (a clock-dial inlay) in the middle, the clock tower at the top, and 15 cottages in a
  ring, each one hand-designed with its own architecture: Stargazer's Tower, Wychwood (a witch's
  cottage), the Weaver's House, Ravenscroft, Mossbank, Elderhollow Apothecary, the Lantern-maker's,
  Toadstool Hollow, Hearthstone Cabin, Gloamend Clockworks, The Old Boot, Fernlea Oak, Rookery House,
  Riverbend Boathouse and Millrace Mill.
- **Every cottage is a private voice room by day and one player's home at night.** Outdoors is one
  voice room (everyone on the square hears everyone). Inside, a cosy room view shows who is in there
  with you ("only you two can hear each other") and a Leave button.
- **Camera:** always shows the whole square (everyone in it sees everyone), never the whole town.
- **Doors are automatic and obvious:** walk into a doorway to go in, or tap/click a cottage to walk
  there and enter. Doors swing open as you approach (only on your own screen). Empty cottages are
  boarded up.
- **Bulletin boards** by each door show who lives there and who's inside, by day only. At night every
  cottage looks the same from outside.
- **Fast movement** (150 px/s): crossing the square takes a couple of seconds.
- **Ambience:** chimney smoke, flickering lamps, the fountain, fireflies at night, door glows, pigeons
  that scatter, a sleeping cat, and a few plain townsfolk going about their day.

## Characters
- **26 characters, no customization, no duplicates in a lobby:** 13 villagers (knight frog, mushroom
  monk, tavern fox, scholar owl, plague-doctor crow, lamplighter moth, goat magistrate, skeleton baker,
  rabbit herbalist, mole smith, snail tinker, toad merchant, the green-hooded Wisp) and 13 CMU course
  mascots (Honk and Chonk, Polly, Clarabelle, Requin, Progress and Preservation, Opal, Cilantro,
  Mincut and Maxflow, Theo Rem, Greenting). All are drawn in 8 directions.
- **Ghosts** are ghostly versions of the character. A halo means the ghost vote is still unspent.

## Social
- **Point:** right-click (or Q), or long-press on touch.
- **Pins:** F, middle-click or shift-click (long-press on touch) marks a person or a spot. Pins come in
  8 colours and carry your character's face; you can have up to 6. Pins and points are only seen by
  people who can see you there; night pins vanish at dawn.
- **Private notebook** (book button or N): notes and quick tags per player plus a free page. It
  autosaves to the server and is seen by nobody else, not even the Storyteller.

## Storyteller
- **The stage-script panel:** a phase bar to jump to any phase, "Tonight's visits" (Go = teleport into
  that house, Next visit, Done), simple day controls, and the full Grimoire and tools one click away.
- **Click anywhere to teleport** (with a poof); click a cottage to step inside.
- **📜 Story:** a private play-by-play of the day and the whole game. At the end the Storyteller may
  release "The story of this game" as a pamphlet to everyone, or tell it themselves. Mid-game public
  pamphlets are an optional setting (off by default).

## Records and admin
- Every game (finished or abandoned) is saved on the server as a full, versioned record with a
  play-by-play timeline (docs/game-records.md), ready for a stats feature.
- **/admin console** (admin accounts only): accounts (search, rename, rotate passphrase, sign out
  everywhere, bulk-delete test accounts), lobbies, saved games with a readable play-by-play and JSON
  download, system status, and an append-only audit log.

## Verified
See docs/test-results.md (v2 sections): typecheck, unit/integration/security tests, and real-browser
suites on hshi-u1 (full game with private-room voice zones, chaos, Storyteller script panel,
pins/pointing, notebook, phone portrait/landscape, walkthrough screenshots).

## Not yet
- Human playtests with real microphones and real phones, plus a full 10–15 person game.
- A stats page (the data is now being recorded).

# v2.1.0 — the town clock and automatic games

- **The tower clock tells the time.** In the square the camera rests on a view that shows the whole
  circle and the clock-tower dial; the dial's wedge and hand show the time left until nominations
  open, or until the day's execution. A small chip at the top says it in words ("Nominations open in
  4:12"). Bedtime counts down on it too.
- **Storyteller games:** the Storyteller can set, pause, add to or clear the day clock from the
  script panel. It is a prop: reaching zero never moves the phase by itself.
- **Automatic games (no Storyteller):** choose "Automatic" when creating a lobby. The server deals a
  legal Trouble Brewing setup, wakes characters at night, hands out information, runs nominations and
  votes on the clock, and decides chance effects (drunk/poisoned information, the Spy and Recluse,
  etc.) at random. The host can tune the timings in the waiting room and can end the game early
  (recorded as abandoned).
- **Asking for more time:** in automatic games anyone can tap "+ time" on the clock chip and propose
  +1, +2 or +3 minutes; everyone gets a Yes/No card and a majority of connected players adds the time.
  Proposals are rate-limited.

# v2.2.0 — faster town, livelier square

## Faster
- The first download before sign-in is 36.5 KiB compressed (was 272): the lobby, Storyteller tools,
  admin and voice (LiveKit) load only when needed. Town art is lossless WebP: 0.8 MiB (was 5.4).
- The town sends ~1.5 KB/s per player instead of ~14 (compact per-viewer position updates).
- Phones: the town uses about half the CPU; weak or GPU-less devices drop to a 30 fps low tier
  automatically (Settings → Graphics quality overrides it).
- Browsers cache the app for a year; deploys keep the previous release's files so open tabs keep
  working. Numbers: docs/perf-v2.2-results.md. Budgets: scripts/perf/budgets.mjs.

## In town
- **Chat bubbles:** what people type also pops up above their character (only for people you can see).
- **Who's talking:** a crisp outline around anyone you hear speaking (gold; rose for you while your mic
  is on) + a sound-wave mark by the name. Settings → Talking outlines: behind buildings (default) or
  always on top.
- **Walk around inside houses**, with furniture; walk out through the door or press Leave.
- **Door boards show character tokens** (portraits; faded for ghosts; name on hover/tap), and each
  house shows its owner's name with a little pointer.
- **Right-drag (or long-press) pie menu** to point or drop a pin in any colour; a quick right-click
  still points.
- **Nick Song** joins the roster, with his own emote: his head becomes 😝.

## Voice
- Big rooms: the panel shows who's talking first, "+N more" for the rest, per-person mute, a
  hold-to-talk button, optional "join busy rooms muted".
- Push-to-talk can be a key or a mouse button (middle / side buttons).
- Microphone and speaker follow your system default (AirPods, closing the laptop lid) and recover
  after sleep; a device picker and a "Retry mic" button when the mic goes silent.

## Lobbies and accounts
- Lobby links are simple words (`/lobby/amber-fox-lantern`); new lobbies get a suggested name and
  default to 15 seats.
- Your record on the home screen: games, wins, streaks, favourite characters, recent games.
- Link previews: shared links show the town art in Discord / iMessage / Slack.
- Clearer join errors, "Can't reach the town" instead of the sign-up page when the server is down,
  automatic reload after a deploy, an Invite friends button, offline-aware reconnecting.

## Storyteller
- **Deal however you like:** Random, a **storyline** preset (7 curated setups, dealt randomly),
  pick the characters and let the server shuffle them, or assign by hand. Automatic games: the host
  picks a storyline (secret by default).
- **Storyteller tools in the waiting room:** set the deal, bedtime, vote speed, door boards and
  pamphlets before the game; **Practice** mode to learn the panel with a fake deal.
- Undo says what it undoes; ready-made false info for drunk/poisoned players; "Tonight at a glance";
  more seat markers; legal-only target pickers; a usable panel on phones in landscape.
- Automatic games explain what they're doing in public announcements.

## Players
- Nominating and the Slayer shot ask for a second tap; the Town list shows hands and votes live;
  keyboard shortcuts (C card, H hand, ? help; listed under How to play → Keys); prompts can't be
  answered twice; dismissable toasts; a personal result line at the end.

## Fixed
- Your own character could be missing (and unable to move) after a fast reload or rejoin
  (hotfixed on prod as 8fbad32, also in this release).

## Verified
Typecheck clean; `pnpm test` 1037 passed; all 10 e2e suites pass (lobby, v21-clock, v2-social, v2-phone, v2-look,
v2-st-ui, ux-ready, game-full, game-chaos, ux-walkthrough) on hshi-u1 — see docs/test-results.md.
Not verified with real hardware yet: AirPods/lid-close switching, mouse side-button push-to-talk,
real LiveKit voice with the talking outline (dev has no LiveKit credentials).
