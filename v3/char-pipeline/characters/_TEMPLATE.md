# __NAME__ — design sheet (__ID__)

Brief: __BRIEF__
Code: `characters/__ID__.js`. Pack: `tools/charpack.sh __ID__ --preset profile --raw` → `shots/char-__ID__/`.
Reference images (optional, yours): `<path>` — what must stay recognisable from them.

> Fill this sheet BEFORE modelling (AGENTS.md stage 1), keep it equal to the code after every round (the critic
> diffs them), and end every round by rewriting §9 from the CURRENT renders. ≤ 2 pages. Worked examples:
> `characters/duelist.md` (biped with a cape and plume), `characters/keeper.md` (robed, staff + lantern),
> `characters/hound.md` (quadruped).

## 1. Concept
One line + 3 adjectives (they set dynamics presets and timing: snappy / heavy / springy / anticipating …).

## 2. Body plan and game speed
- Plan: biped | uprightAnimal (chibi) | quadruped | bird | hopper | limbless | flier | longNeck — and why.
- Height H = … m, hip height … m, head = … heads.
- Game speed (game-profile.json): v_game = heightsPerSecond × H = … m/s; N = … drawings per cycle held 2 grid frames
  → cycle = N·2/30 = … s; one step = v_game·N·2/60 = … m; duty bound β ≤ 0.9·hip / (cycle length) = ….
- Gait in one word (scurry / hop / waddle / glide / flutter / bound / lumber / prance) and why the arithmetic allows it.

## 3. Silhouette (black blob at ~50 px, and at 25 %)
1. Signature shape 1 — …
2. Signature shape 2 — …
What reads at S/N (only WIDTH changes the S/N outline), at E/W (profile), at the back (N/NE/NW).
Closest look-alike among your other characters and the shape that separates them.

## 4. Proportions
| | metres | texels @ vh 10 (36 px/m) | @ vh 12.5 |
|---|---|---|---|
| height (ground → top) | | | |
| head (chin → crown) | | | |
| signature part | | | |
| eyes | ≥ 0.07 (2×2 texels) | | |

## 5. Palette (sRGB `[hi, mid, sh]`; ≤ 5 slots + 1 accent)
| slot | hi | mid | sh | use |
|---|---|---|---|---|
| | | | | |
Rules: signature = the lightest mass in sun AND shade; ≥ 30° hue or ≥ 25 % L off lit grass (#75A558 mid) at noon AND
golden; shadow tones of different slots ≥ 20° hue apart, lifted along the slot's OWN hue; night sh ≥ #3A3040; no
pure black/white.

## 6. Parts and bones
Template + chains + sockets; part list (bone → shapes, slot); held props: side, distance, clearance from the face at
all 8 facings.

## 7. Unique to me (mandatory — the critic grades it)
1. **Extra animated parts**: which secondary parts move (ears, tail, wings, cape, hat feather, prop …) and HOW
   (spring chain + preset, keyed per drawing ≥ 25°, or FX). Which of them carry the gait rhythm at game speed.
2. **Own gait**: how it moves unlike your other characters, and the arithmetic that keeps it readable and 0-slide at
   v_game.
3. **Expressions in this style**: eyes 2×2 texels, mouth/beak opening ≥ 2 texels, brows ≥ 25°, head squash — what talk,
   vote, die, emote need and how each reads at 1×. Never sub-texel nuance.
4. **Readability at game speed**: for each clip, what carries it (a big arm arc, head bob, hop apex), its timing in grid
   frames, and the 1× GIF you check it on (`clip-<c>-1x.gif`, `game-1x.gif`).

## 8. Motion list (30 Hz key grid; f = grid frame, hold in grid frames)
| clip | key f | hold | pose / what must READ | events / smear |
|---|---|---|---|---|
| idle | 0 / 30 / 36 / 66 | 30 / 6 / 30 / 6 | breathe, 1 texel bob | |
| walk | N drawings × 2 | | contact / down / pass / up | |
| talk | | | | speak |
| vote | 0, 4 | 4, hold | dip → arm/prop above the head | vote@handR |
| point | | | | |
| die | | | ends lying, reads "down" at 25 % | die, land |
| ghost / ghost-spent | | | | |
| `<emote>` | | | | |
Secondary motion (final numbers = the code): chains `{f, zeta, r}`, personality, FX.

## 9. Self-critique (AGENTS.md stage 5; every score cites a file + facing/frame + a number)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | | | |
| 2 | Pixel stability | | | |
| 3 | Line quality | | | |
| 4 | Tonal discipline | | | |
| 5 | Ground separation | | | |
| 6 | Proportion, appeal, expression | | | |
| 7 | Animation timing | | | |
| 8 | Weight, contact, game speed | | | |
| 9 | Personality, secondary, uniqueness | | | |
| 10 | Smears and FX | | | |
| 11 | Facing and turns | | | |
| 12 | Technical | | | |
Total: __/24. Three weakest points: …
