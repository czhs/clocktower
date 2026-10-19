# <Town name>: lore seeds for the interiors (owner: <main session>; read-only for agents)

> Structure of `../pixel3d/docs/LORE.md`, which turned 15 look-alike rooms into 15 distinct ones. Fill it in before
> any interior builder starts, and pass its path to the interior workflows (`demo-finish.workflow.js` `args.lore`).

**User request (<date>):** every interior must be VERY visually distinct, with its own style and AMBIANCE, and each
room should almost tell a story that hints at the lore of the town. Use hints, never exposition: no walls of text,
no signs that explain things. A player who peeks into several houses should start connecting the threads.

## The town in one paragraph
<Where it is, what happened ("the long night"), how the town lives with it now, what the game is about underneath.
Five or six sentences.>

## Shared motifs (spread each over 2-4 houses, never all in one room)
- **<motif 1>**: <e.g. a time when something stopped; how it shows up (stopped clocks, a circled time)>
- **<motif 2>**: <e.g. the same date circled on calendars / ledgers>
- **<rare motif>**: <a small odd symbol hidden in EXACTLY <n> houses (a letter, a stopper, a book spine). Never explained.>
- **<the missing object>**: <lost that night; someone searches for it; it is somewhere else (name the house)>
- **<the central artefact>**: <copies, sketches, rumours of it>
- **<everyday object with a twist>**: <every house has one from <maker>; one house's is missing or smashed>

## The houses: who lives there, what the room hints at, and its ambiance
| # | house | inhabitant & story hook | key props / clues | ambiance (light, palette, particles, mood) |
|---|---|---|---|---|
| 0 | <name> | <who; the hook> | <3-5 props, motifs marked> | <key light colour, palette, one particle / motion, mood word> |
| 1 | … | … | … | … |

## Distinctness rules for builders
- Vary the ROOM ITSELF, not just props: room shape (L-shape, round tower room, loft/mezzanine, low cabin, workshop),
  fireplace position (or none), window placement, floor material, wall material, ceiling height, clutter density.
- Each interior gets its OWN lighting recipe (key light colour and temperature, night glow sources) and at least one
  cheap animated ambiance element (motes, steam, sparks, firefly specks, ripples, a ticking pendulum, a swinging
  lantern).
- Each has 2-4 story props that read at the interior camera (bigger and simpler than you think: 640x360), plus small
  details for people who look closely.
- Silhouette test: thumbnails of all rooms side by side must be told apart at 25 % size by layout, palette and light
  alone, **at noon and at night**.
