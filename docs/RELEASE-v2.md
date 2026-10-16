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
