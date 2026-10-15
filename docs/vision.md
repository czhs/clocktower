# Product vision (read this before changing any player- or Storyteller-facing behaviour)

> 15 friends open a link, appear as little pixel-art characters in a charming gothic town, naturally
> talk and scheme with one another, and a human Storyteller guides them through an unforgettable game
> of Blood on the Clocktower. The technology fades into the background.

This is **not** an automated BotC simulator. It is a cozy multiplayer RPG town + a spatial voice-chat
platform + a very good digital Storyteller assistant. The fun is people walking around, whispering,
lying, forming groups, going home at night, and the Storyteller physically visiting them.

## Principles (in priority order when they conflict)

1. **Voice is the core technology.** Walking into the square joins the big discussion; walking down a
   street with someone starts a private chat; entering a house together is private; night = private
   with the Storyteller. No menus, no channels, no LiveKit concepts exposed. Always show *who can hear
   me* and *am I muted*. Recover from mic/network/refresh problems gracefully and say what (if
   anything) the player must do. Dead players stay social.
2. **The Storyteller's judgment is authoritative.** The rules engine is an assistant: reminders,
   suggestions, warnings — never a gate that blocks an ST action. Every piece of state is a prop the ST
   can move (phases, votes, block, deaths, ghost votes, characters, statuses, positions, doors,
   timers). Consequential actions get a clear confirmation and an undo; nothing a single misclick does
   should be irreversible or reveal private info to the wrong person.
3. **Reduce the Storyteller's cognitive load.** The ST UI answers at a glance: who do I visit next,
   what does this person need to learn, who is poisoned/drunk/protected/dead, what is unresolved,
   what happens if I choose X, who has been visited, is everyone ready, are any nominations/votes/night
   actions pending. Someone who knows BotC but not this software can run a game comfortably.
4. **Idiot-proof for players, learned by playing.** Joining is obvious; everyone knows their
   character, their house and what to do *right now*; movement/doors/objects/voice are intuitive;
   night means "walk home and wait"; a Storyteller visit is unmistakably private; voting shows
   countdown, confirmation and whether your vote counted; the dead know their ghost-vote status.
   Contextual hints appear only when useful; no 20-minute explanations, no giant tutorial.
5. **Let the game breathe.** The Storyteller sets the pace; the software never rushes phases. Night is
   theatrical (walk home, town quiets, lamps, the Storyteller's lantern). Art, ambience and CMU easter
   eggs support atmosphere without distracting or complicating.
6. **Accommodate human mistakes.** Gentle reminders over failures; friendly messages over technical
   errors; easy rejoin with identity/role/house intact; sensible handling of players who aren't ready
   or are in the wrong house; simple ways for the ST to intervene.
7. **Players can't cheat.** Ordinary players cannot bypass voting rules, change roles, or see
   privileged information — server-side, always.

## How we evaluate

Not "do tests pass" but: Would a new player know what to do? Could a Storyteller run a full game
without developer help? Can people talk naturally without fiddling with controls? Does moving around
town make the social experience better? Are night visits fun rather than tedious? Can a complete game
unfold without a console, repeated refreshes, or "how does this work?" questions?

Prefer small, thoughtful UX improvements, better defaults, clearer feedback and robust handling of
common situations over rewrites or big new frameworks.
