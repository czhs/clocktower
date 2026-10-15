# CMU easter eggs — Hollowmere

Owner: cmu-eggs. Hidden Carnegie Mellon references for a gothic village whose players are mostly
CMU students. Goal: an outsider sees a charming haunted town; a CMU student occasionally stops and
thinks "wait, is that Wean?". Nothing here is a logo, a photo or copied text: every sprite is an
original pixel-art interpretation (procedural blockout repainted by gpt-6-astra, then cut to the
master palette), every line is original writing.

- Research (Astra via `codex exec -m gpt-6-astra`, browsing): `packages/assets/eggs/research/research.md`
  (prompt next to it). Sources are linked below; "verified" means seen on an official course or
  university page, "partially verified" means secondary sources (CMU news, Reddit, student press).
- Code: `packages/assets/src/eggs/` (placements + pure behaviour), `apps/client/src/game/eggs/`
  (rendering + examine cards), `packages/assets/eggs/` (art pipeline, prompts, raw model output,
  verification spec), `packages/assets/generated/eggs/` (shipped sprites + manifest).
- Tests: `packages/assets/test/eggs.test.ts`; in-game run: `packages/assets/eggs/verify/eggs.spec.ts`.

## Rules the eggs follow

- **Local only.** Examine cards and animations run in the client. No server message, no game
  state, no new C2S/S2C traffic. The only shared data are static map objects (`EGG_PROPS`,
  `EGG_STRUCTURES`), which the server sees as ordinary collision.
- **No information, no advantage.** Behaviour depends only on public map data, the wall clock and
  the public phase (plus your own position, to know what you stand next to). Nothing reads other
  entities, the Storyteller, visits or views (a test greps the egg code for `remoteEntities`,
  `gameView`, `.send(`, snapshots, `innerHTML`, `fetch(`). Everyone sees roughly the same thing at
  the same time (wall-clock schedules).
- **Night.** "Dark" = public phase `bedtime`/`first_night`/`night`/`dawn`; outside a game day/night
  (`waiting`, `setup`, `finished`) the local clock decides (21:00–05:59). Night-only eggs are seen
  by players walking home at bedtime and by the Storyteller at night. Outdoor eggs (and the
  creatures) are hidden whenever you are indoors, so a player shut in their home at night sees none
  of them (checked in the real game).
- **Never in the way.** Egg collision tiles sit on open ground only (no road/path/plaza/bridge
  tile, no building, no doorstep, no other prop); creatures never collide with anyone and their
  routes avoid every door and the tiles around it; examine spots are ≥ r + 22 px from every door so
  the door prompt always wins. The world-audit nav tests (`navigation.test.ts`) stay green with the
  eggs merged.
- **Atmosphere, never distraction** (`docs/vision.md`). Interactions are one short card, dismissed
  with Esc, E (plaques) or by walking away; no sounds; no long minigames (the Engine is five
  buttons). No egg, creature or examine spot within the square plus 3 tiles (where the town talks;
  tested), none on the lanes/roads players use going home (egg collision never on a path tile;
  creatures sleep from bedtime, except the night-only hedgehog in the side yard by the well).
  Rare events (Greenting, Chonk, Requin's grin) happen every 3–18 minutes, for seconds.
- **Art direction.** `docs/art-direction.md`: master palette only (every frame is snapped to it),
  colour budgets (props 8, fences 10, creatures 12, the two landmark buildings 16), 1 px dark
  contour, moonlight from the upper left, no baked glow (night light is a runtime ADD glow), cards
  use Parchment/Ink, Panel ink/Frame iron, 4 px radius, 16 px body text, gold only for focus.

## Mascot research (what is verified)

Instagram itself could not be inspected (direct profile pages and a public mirror failed to load;
no login was attempted), so **no handle is verified from the account itself**. Course identities
come from official course pages/material:

| Course | Mascot | Evidence | Used? |
|---|---|---|---|
| 15-122 | **Honk** (grey goose) + **Chonk** (human-sized white goose) | [F24 staff page](https://www.cs.cmu.edu/~15122-archive/f24/staff.shtml), [SCS mascot feature](https://www.cs.cmu.edu/news/2025/mascots) — identity verified, look partially | yes |
| 15-150 | **Polly the Polymorphic Parrot** | [staff page](https://www.cs.cmu.edu/~15150/staff.html) — identity verified; handle `@pollythepolymorphicparrot` only partially verified (TA bio, The Tartan) | yes |
| 15-210 | **Clarabelle the Parallel Cow** | [15-411 S25 assignment p. 2](https://www.cs.cmu.edu/afs/cs/academic/class/15411-s25/www/writtens/assignment3.pdf) — verified | yes |
| 15-213 | **Requin the Shark** | [213 staff page](https://www.cs.cmu.edu/~213/staff.html) — verified | yes |
| 15-312 | **Progress and Preservation** (green and blue frogs) | 15-411 assignment + SCS gallery — verified; which name is which colour is unknown | yes |
| 15-411 | Opal the Optimizing Otter | [staff page](https://www.cs.cmu.edu/~15411/staff.html) — verified | not used (scope) |
| 15-251 | Cilantro the giraffe (blue hoodie, green scarf) | SCS feature only — partially verified; handle unknown | not used (unverified; a giraffe breaks the village) |
| others asked about (15-112, 15-151, 15-259, 15-281, 15-317, 15-410, 15-445, 18-213/240/290/341/349, 21-127) | not found | see research.md | — |

**Confirmed by the user (2026-10-15)** — overrides the table above where they differ; all are to be
included, in the bold/chunky character style (see docs/art-direction.md and the user's visual direction):

| Course | Mascot | Design notes from the user |
|---|---|---|
| 15-122 | Honk (grey goose) + Chonk (giant white goose) | as above — confirmed correct |
| 15-150 | Polly the Polymorphic Parrot | wears a **black λ (lambda) T-shirt** |
| 15-210 | Clarabelle the Parallel Cow | confirmed |
| 15-213 | Requin the Shark | **French — wears a beret** |
| 15-312 | Progress and Preservation (frogs) | confirmed |
| 15-411 | Opal the Optimizing Otter | confirmed; now include |
| 15-251 | Cilantro the giraffe (blue hoodie, green scarf) | confirmed; now include (out-of-place is fine) |
| 15-451 | **Mincut and Maxflow** — a red panda and a fox | user photo reference: large orange fox plush + small red panda (which name is which is not stated) |
| 15-151 / 21-127 | **Theo Rem**, the hedgehog | name is a pun on "theorem" |
| UCT | **Greenting** | user image reference: green, rounded creature head with a black mark (`packages/assets/eggs/refs/user-greenting.png`) |

User reference images are stored in `packages/assets/eggs/refs/` (gitignored): use them to get the
look right, but draw original pixel-art characters; never trace or ship the photos.

The village versions are original reinterpretations, not reproductions of the plush toys, and the
town never names them as "official" mascots (only the examine text of other eggs alludes to them).

## Shortlist (~25 candidates)

Visibility: **O** obvious, **S** subtle, **H** hidden. Int = has an examine/interaction.

| # | Candidate | Source | Why insiders laugh | Placement idea | Vis | Int | Pick |
|---|---|---|---|---|---|---|---|
| 1 | The Fence, repainted every night, guarded overnight | [Fence history](https://www.cmu.edu/125/stories/fence-history.html), [StuGov rules](https://www.cmu.edu/stugov/fence/index.html), [r/cmu fence camping](https://www.reddit.com/r/cmu/comments/ocirzr) | everyone has painted, guarded or lost the Fence | verge north of the main road, west of the square | O | yes | ✔ |
| 2 | Wean as a stern grid-windowed keep with too many low floors | [readme: Vote Wean Hall!](https://cmureadme.com/article/readme-endorses-a-candidate/), [Tartan building ratings](https://the-tartan.org/2024/02/04/rating-cmu-academic-buildings/) | the beloved ugly concrete building | meadow at the foot of the north cliff | S | yes | ✔ |
| 3 | A lift that overshoots and makes you walk down | [r/cmu "Wean 8, rations low"](https://www.reddit.com/r/cmu/comments/1opf2ia/on_my_way_to_wean_8_and_rations_are_getting_low/), [readme elevator paper](https://cmureadme.com/article/wean-elevators-solution/) | Wean elevators | the keep's door | S | yes | ✔ (in 2) |
| 4 | A skybridge from floor 7 to floor 2 | [r/cmu Doherty thread](https://www.reddit.com/r/cmu/comments/xck3gl) (7↔2 partially verified), [Wean 5 ↔ Doherty A](https://www.cmu.edu/engineering/estp/_downloads/estp_student_handbook_v5.6_10aug2015.pdf), [Wean 4 = NSH 4 = Gates 4](https://www.cs.cmu.edu/scs25/faq) | floor numbers that never line up | keep ↔ workshop | S | — | ✔ (in 2) |
| 5 | Hamerschlag as a gothic workshop, round tower hiding a chimney | [ECE photo](https://www.ece.cmu.edu/news-and-events/story/2021/12/chi-sps-distinguished-lecturer.html), [arch. history](https://iiif.library.cmu.edu/file/ALU_1978_062_003_09001978/ALU_1978_062_003_09001978.pdf) | the ECE building's silhouette | next to the keep, on a rock by the waterfall | S | — | ✔ |
| 6 | Perpetually broken EE lab / 18-290 errors | [r/cmu 18-290](https://www.reddit.com/r/cmu/comments/18778xs), [ECE catalog](https://coursecatalog.web.cmu.edu/schools-colleges/collegeofengineering/departmentofelectricalandcomputerengineering/courses/) | Signals & Systems pain; lab gear that never works (user brief; not found as a Reddit meme) | workshop door | S | yes | ✔ |
| 7 | Bomb Lab box: 6 phases, explosions get reported | [CS:APP labs](https://csapp.cs.cmu.edu/3e/labs.html) | every explosion costs half a point | inside the workshop card | H | yes | ✔ (in 6) |
| 8 | Hidden old computer running Malloc Lab | [CS:APP labs](https://csapp.cs.cmu.edu/3e/labs.html), [r/cmu mirrored photos / Proxy+Malloc](https://www.reddit.com/r/cmu/comments/1bd778u) | mdriver tables, Autolab, grace days, the default team "Harry Bovik" | cellar hatch between the keep and the workshop | H | yes | ✔ |
| 9 | Harry Q. Bovik's grave | CMU's fictional default author (lab handouts, SIGBOVIK) | "please put your name here" | graveyard, end of a row | H | read | ✘ cut (vision); Bovik lives on in the Engine, shelf, Fence |
| 10 | Office-hours queue | [r/cmu OHQueue](https://www.reddit.com/r/cmu/comments/iwgvh6), [213 OH queue](https://www.cs.cmu.edu/~213/) | the queue never moves | ghosts queueing at the crypt, night only | H | read | ✔ |
| 11 | Shelf of increasingly absurd textbooks | course names; [CS:APP](https://csapp.cs.cmu.edu/3e/labs.html) | 213/122/150/127/251/290/210 in disguise | Mortimer's Curios (shop interior) | S | yes | ✔ |
| 12 | readme-style administrative notices + an exam with an absurd deadline | [r/cmu fun is forbidden](https://www.reddit.com/r/cmu/comments/1s9pwkr/is_having_fun_possible/), [shuttle 2 min](https://www.reddit.com/r/cmu/comments/x8k3uf), [rare sunshine](https://www.reddit.com/r/cmu/comments/lgtoql), [readme](https://cmureadme.com/issues) | campus life in bureaucratese | the existing well-yard noticeboard | O | read | ✔ |
| 13 | Blackboard of absurd math | 21-127 / 15-251 culture | "for large values of 2" | tavern "today's specials" board | S | read | ✘ cut (vision) |
| 14 | "Cornell of the top 20s" | user's own joke (no Reddit source found) | self-deprecating rankings humour | town-gate signpost | H | read | ✘ as a prop; the joke is on the shelf and the Fence |
| 15 | Randy Pausch bridge lights | [bridge project](https://www.cs.cmu.edu/~PauschBridge/), [CMU bridge page](https://www.cmu.edu/randyslecture/bridge.html) | colours travelling across the span at night | south-lane footbridge | O at night | — | ✔ |
| 16 | Buggy rolling through | [CMU Buggy](https://www.cmu.edu/buggy/), [course](https://cmubuggy.org/news/reference/course/) | low three-wheeled shell, free roll | south lane, every 7 min by day | S | — | ✘ cut (rolled through a main lane) |
| 17 | Scotty the terrier in tartan | [mascot mark](https://brand.cmu.edu/visual-identity/carnegie-mellon-trademarks/mascot-mark), [tartan colours](https://www.cmu.edu/commencement/assets/finalprogram2019web.pdf) | the university mascot as a village dog | patrols the Fence (moved out of the square) | O | — | ✔ |
| 18 | Walking to the Sky | [public art page](https://publicart.cmu.edu/objects/1086/walking-to-the-sky), [readme "Walk Faster"](https://cmureadme.com/issues/6/3) | 7 walkers up a pole, 2 watching; at night one finally gets there | walled garden | S | — | ✔ |
| 19 | Requin (15-213) | staff page | a shark in the millpond | fin circling the pond | H | — | ✔ |
| 20 | Honk & Chonk (15-122) | staff page, SCS feature | a goose; and a goose the size of a person | garden; Chonk by the south wall, rarely | S/H | — | ✔ |
| 21 | Polly (15-150) | staff page | *polymorphic*: new plumage every time you look | perched on lamp tops, flies between them | S | — | ✔ |
| 22 | Clarabelle (15-210) | 15-411 assignment | *parallel* cow: two cows in perfect lock-step | east-bank pasture | S | — | ✔ |
| 23 | Progress & Preservation (15-312) | 15-411 assignment | type safety: one always takes a step, the other keeps the spacing | pond shore | H | — | ✔ |
| 24 | Opal the Optimizing Otter (15-411) | staff page | — | river | H | — | ✔ (user-confirmed) |
| 25 | Cilantro the giraffe (15-251) | SCS feature (partial) | — | — | — | — | ✔ (user-confirmed) |
| 26 | Gates helix / floors 3–5 ramp | [Piper 2009](https://www.cmu.edu/piper/news/archives/the-piper/ThePiperSept09.pdf) | — | would need a new building | — | — | ✘ |
| 27 | Kiltie band banana + chocolate milk | [Kiltie traditions](https://tartanconnect.cmu.edu/kiltieband/traditions/) | — | — | H | — | ✘ (too obscure, clutter) |
| 29 | Mincut & Maxflow (15-451), Theo Rem (15-151/21-127), Greenting | user | course mascots | — | — | — | ✔ (user-confirmed) |
| 28 | Wean ninth-floor lore | [r/cmu](https://www.reddit.com/r/cmu/comments/swg7pr) | — | — | — | — | ✘ (the keep has 9 floors anyway) |

## Final picks (20)

Tightened after the vision note (2026-10-14): the buggy (moved through a main lane), the Bovik
headstone, the tavern chalkboard and the gate signpost were cut; their jokes live on inside the
remaining eggs (Bovik in the Engine, the shelf and the Fence; "Cornell of the top twenty" on the
shelf and the Fence; the absurd-deadline exam on the noticeboard). Scotty moved out of the square.
Five elaborate/interactive eggs, four passive/examine eggs, eleven creature entries (the course
mascots confirmed by the user + Scotty). Coordinates are tiles (x, y).

| # | Egg | Where | Visibility | Interaction | Inspiration |
|---|---|---|---|---|---|
| 1 | **The Fence** — stubby, rounded with paint, four paint jobs; repainted at every public dawn (per calendar day before a game); a tartan guard tent with a glowing lantern beside it after dark | (58–61, 35), grass north of house 6, off the lane | obvious object, subtle reference | E: card with tonight's paint (13 original messages), "layer N of paint", the guards at night | #1 |
| 2 | **The Keep's lift** (Wean) — 9 low floors of identical windows (lit ones glow at night), tartan pennant, skybridge leaving floor 7 | keep (77–79, 10–11), door (78, 12) | subtle | E ×6: call, wait, wait, overshoot to 6 + "walk down two flights", the floor-4 / 7→2 plaque, back up | #2–4 |
| 3 | **The Workshop** (Hamerschlag) — workshop on a rock, round domed tower, gear, water wheel; the skybridge arrives at its 2nd floor; its dark window spits **sparks** every few seconds | (81–83, 10–11), door (82, 12) | subtle | E ×7: OUT OF ORDER bench, sine vs square wave, Bomb Lab box (phase 1 defused, phase 2 BOOM + pigeon, −½ point), "neither causal nor stable", aliasing fish, "repaired 1898 / no it isn't" | #5–7 |
| 4 | **The Engine** — cellar hatch with a pulsing green screen-glow in the alley between keep and workshop; below, a calculating engine running Malloc Lab; a plush shark in the comfy chair | hatch (80, 10) | hidden | E: terminal card, 5 commands (`make`, `./mdriver -V`, `git commit -m "pls"`, `./submit` → Autograder automaton 34.7/100, grace days −1, `sleep 8h`) | #8 |
| 5 | **Mortimer's shelf** — increasingly absurd textbooks priced in grace days | shop interior, left shelf (146, 36) | subtle | E ×13, remembered between visits (CS:APP "A Ghost's Perspective" … Bovik's collected works … "the Cornell of the top twenty" … YOUR THESIS) | #11 |
| 6 | **Office hours at the crypt** — 7 ghosts queue at the crypt door after dark | crypt (69–72, 11–13) | hidden, night only | examine: day plaque / night "Now serving #3. Your number #147" | #10 |
| 7 | **Village notices** — 3 a day from 12 (exam posted 11:58 for 11:59, fun 2:00–2:15 graded, sun sighted, coach in two minutes, VOTE THE KEEP…) | existing noticeboard (36, 28) | obvious object | examine | #12 |
| 8 | **Randy Pausch bridge** — lanterns on both rails of the south-lane footbridge; muted by day; after dark colours travel across the span with glows and coloured washes on the water | (84–87, 66–67) | obvious at night | — | #15 |
| 9 | **Walking to the sky** — iron pole, 7 walkers, 2 onlookers; after dark every 30 s a pale wisp steps off the top | walled garden (26, 14) | subtle | — | #18 |
| 10 | **Scotty** — boxy black terrier with a big beard in a CMU-tartan coat, patrolling the Fence, sitting now and then | around the Fence | obvious creature, subtle reference | — | #17 |
| 11 | **Requin** (15-213) — a fin **in a beret** circling the millpond; every ~5 min the whole shark surfaces and grins | pond | hidden | — | #19 |
| 12 | **Honk** (15-122) patrols the walled garden (waddle, honk); **Chonk** stands by the south wall for 40 s every ~18.5 min | garden; (44, 88) | subtle / very hidden | — | #20 |
| 13 | **Polly** (15-150) — parrot **in a black λ T-shirt**, perched on lamp tops (north lane, east bank), flies on every ~2.5 min, new plumage every 23 s ("polymorphic") | lamps (72,32), (56,32), (88,46) | subtle | — | #21 |
| 14 | **Clarabelle** (15-210) — two identical cows grazing in perfect lock-step | east-bank pasture (90–92, 13–30) | subtle | — | #22 |
| 15 | **Progress & Preservation** (15-312) — the green frog always hops forward along the shore, the blue one follows exactly two hops behind | pond shore | hidden | — | #23 |
| 16 | **Opal** (15-411) — otter in an orange harness floating on her back down the river and back, in straight segments, out of sight under the bridges | river | subtle | — | user-confirmed |
| 17 | **Cilantro** (15-251) — giraffe in a blue hoodie and green scarf, waiting just outside the south gate (blinks) | (57, 92) | hidden | — | user-confirmed |
| 18 | **Mincut & Maxflow** (15-451) — a plump fox and a red panda watching the river's flow below the main bridge (ear twitch, panda stands up) | west bank (80–81, 54–55) | subtle | — | user-confirmed |
| 19 | **Theo Rem** (15-151 / 21-127) — a hedgehog who only comes out after dark in the well yard; when he stops, a tiny end-of-proof tombstone ∎ appears over him | well yard (37–43, 25–29) | hidden, night only | — | user-confirmed (pun on "theorem") |
| 20 | **Greenting** — a rounded green creature that pops out of the town well for 5 s every ~3 min | well (39, 27) | very hidden | — | user-confirmed |

Why these: they cover the brief's strongest seeds (Fence, Wean, Hamerschlag, bridge, Scotty,
Walking to the Sky, labs, exam, notices, textbooks, night-only) and every course mascot the user
confirmed, lean on CS/ECE insider jokes (213 labs, Autolab, OH queue, 290, mascots that are puns on
their courses: parallel cows, polymorphic parrot, progress/preservation frogs, a theorem hedgehog
that leaves tombstones), and each still works as a fantasy-village object for someone who has never
heard of CMU. No real person is depicted, named or quoted.

### Running motifs

- **The Lift** — the Keep's lift is the town's eternal repair project: the lift card, the notice
  "repaired* (*pinned since 1971)", the Fence ("THE KEEP'S LIFT IS FIXED / NO IT ISN'T").
- **Harry Q. Bovik** — the town's absent default author: the Engine's team struct, his collected
  works ("Please put your name here"), the Fence's birthday wish.
- **11:59** — every deadline in Hollowmere: the exam notice, the Engine's due date, the Fence.
- **Grace days** — the local currency: Mortimer's prices, the Autograder's "−1", an empty ledger.
- **Floors that don't line up** — 7→2 skybridge, floor 4 being three buildings' floor 4.

## Lighting (the eggs take part in it)

All runtime, nothing baked (ADD glows from the town's `lights` texture above the lighting layer):
lit window panes of the Keep and the Workshop and the tent lantern glow after dark (positions found
in the final sprites by `detectWindows`, stored in `generated/eggs/manifest.json`); the hatch's
green screen pulses (faint by day); the Workshop's broken instrument throws a spark burst every few
seconds (`sparkBurst`, wall-clock); the Pausch bridge lanterns cycle colours with soft washes on the
water; a pale wisp leaves the top of the sky pole.

## Art pipeline (gpt-6-astra)

1. `eggs/scripts/sprites.ts` + `mascots.ts`: procedural blockouts at native 1x size (silhouette,
   footprint, anchor, main colours; chunky creature designs). The skybridge height is shared
   (`BRIDGE_FLOOR`) so the keep's 7th floor meets the workshop's 2nd.
2. `build.ts refs <job|all|all2x>` (hshi-u1): magenta reference sheet + 2× crop of the real town
   + prompt → `eggs/refs/<job>/` (git-ignored, synced).
3. `eggs/scripts/codex-job.sh <job>` (Mac): `codex exec -m gpt-6-astra -s workspace-write` in
   `eggs/staging/<job>/` (git- and sync-ignored), result copied to `eggs/incoming/` (git-ignored).
4. `build.ts ingest <job>`: → `eggs/raw/<job>.png` (1x jobs ≤ 1024 px; 2x jobs full size) +
   `.json`; the prompt actually sent → `eggs/prompts/<job>.md`.
5. `build.ts build`: the main pipeline's `processFrame` (grid detection, bbox alignment, palette
   reduction, cleanup, silhouette IoU, grounded edge) per frame; the last job listing a frame
   decides it; animation groups never mix AI and blockout frames; then master-palette snap + colour
   budget. Output: `generated/eggs/<frame>.png` (1x), `manifest.json` (source/IoU/colours/glows),
   `review.png`.
6. **2x density** (art-direction "Visual overhaul"): `eggs2x-*` jobs show the shipped 1x frames
   upscaled 2x and ask Astra for a double-density redraw; validated against the upscaled 1x
   silhouette. Output `generated/eggs/2x/<frame>.png` (exactly 2× each 1x frame; an unvalidated
   frame ships as the upscaled 1x frame, flagged in `2x/manifest.json`) and `EGG_SPRITES_2X` /
   `EGG_DENSITY_2X` in `src/eggs/index.ts`. Current state: all 43 frames validated at 2x.
7. `pnpm assets:generate` (art lead) packs `EGG_SPRITES` (1x) into `objects.png` today; when the
   generator moves to `density: 2` it should pack `EGG_SPRITES_2X` instead. The client scales its
   egg images by `1/density` read from `objects.json` / `characters.json`.

Codex runs (all `codex exec -m gpt-6-astra`, one image call each; ~1–1.5 min per image job):
research (browsing, ~14 min); first pass `eggs-weanworks`, `eggs-props`, `eggs-creatures`,
`eggs-retry` (superseded and removed); chunky creatures `eggs-creatures` (twice); final 1x pass
after the new art bar `eggs-weanworks`, `eggs-props`, `eggs-creatures`, `eggs-mascots`; 2x
redraws `eggs2x-wean`, `eggs2x-workshop`, `eggs2x-props`, `eggs2x-fences`, `eggs2x-creatures`,
`eggs2x-mascots-a`, `eggs2x-mascots-b`. Per-frame results: `generated/eggs/manifest.json`,
`generated/eggs/2x/manifest.json`. No usage-limit errors occurred.

## Hooks and contract notes (for the lead / art lead)

- `layout.ts` merges `EGG_PROP_DEFS`, `EGG_PROPS`, `EGG_STRUCTURES`; `generate.ts` packs
  `EGG_SPRITES`. Frames that are not kinds (animation frames, fence variants, the tent) are drawn
  only by the client. **Any change to egg placements makes the committed `generated/town.json`
  stale** (`layout.test.ts` "Tiled map … consistent" fails until `pnpm assets:generate` runs).
- CONTRACT-REQUEST (art lead): when `generate.ts` switches to `density: 2`, pack `EGG_SPRITES_2X`
  (paths `../../generated/eggs/2x/<frame>.png`, each exactly 2× the 1x frame).
- CONTRACT-REQUEST (lead): the client imports the pure egg module by relative path
  (`apps/client/src/game/eggs/index.ts` → `packages/assets/src/eggs/world.ts`) because
  `@ct/assets` exports only `.` and `./generated/*`; an `"./eggs": "./src/eggs/index.ts"` export
  would make it `@ct/assets/eggs`.
- `eggs/scripts/*.ts` and `eggs/verify/*.ts` are outside `packages/assets/tsconfig.json`'s include
  (run with tsx / Playwright; not covered by `pnpm -r run typecheck`).
- Opt-in debug hook: `localStorage.ctEggsDebug = '1'` exposes `window.__ctEggs` (local visual
  time travel, own position, egg update cost). Purely local; used by the verification spec.

## Status (2026-10-14, art work paused by the user)

All 20 eggs are implemented, integrated and enabled; nothing is half-integrated (no
`EGGS_ENABLED` switch was needed). Art: every 1x and 2x frame is a validated gpt-6-astra repaint
(see the two manifests). The art lead's 21:09 atlas (`density: 2`) already contains the eggs.

| Egg | Status |
|---|---|
| Fence, Keep's lift, Workshop (+ sparks), Engine, Mortimer's shelf | done, verified in game (cards, night tent/glows) |
| Office hours at the crypt, Village notices | done, verified (night queue of 7, day/night plaque, notices card) |
| Pausch bridge, Walking to the sky (wisp) | done, verified (night glows; wisp frozen-time shot) |
| Scotty, Honk/Chonk, Polly, Clarabelle, Requin (+ grin), Progress & Preservation | done, verified visible in day, hidden at night; walked straight through Scotty |
| Opal, Cilantro, Mincut & Maxflow, Theo Rem (night), Greenting | done, verified visible (Theo at night only) |
| Buggy, Bovik headstone, tavern chalkboard, gate signpost | cut (vision note); code and sprites removed |

## Verification

In-game run (`packages/assets/eggs/verify/eggs.spec.ts`, built client + server on
127.0.0.1:3370, Chromium with hardware WebGL on the RTX 3060 — SwiftShader ran at ~1 fps under the
host's load — Storyteller browser + player browser + 4 bots): **1 passed (5.9 min)** on the 1x
renderer. It walks to every egg, screenshots it (`docs/screenshots/egg-*.png`), exercises every
card, checks night-only behaviour (a player shut in their home at night sees no outdoor egg), walks
through Scotty, and measures frame time: p50/p95 16.7/16.8 ms at the square edge and at the pond
(vsync-bound), egg update cost avg 0.11–0.13 ms/frame (max 3.7–6.9 ms, single spikes), no page
errors. A rerun against the art lead's new 2x renderer was cut off by an ssh disconnect after 21
of 28 screenshots; those 21 screenshots are from the 2x renderer, the other 7 (chonk, cilantro,
greenting, mincut-maxflow, opal, pond, pond-requin-grin) from the 1x run, where a stale
"E — …" prompt is visible (bug: `[hidden]` lost to `.ct-game-prompt{display:flex}`; fixed in
eggs.css after that run, confirmed hidden in the 2x screenshots).

Unit tests: `packages/assets/test/eggs.test.ts` (13): placements on open ground, no doorsteps or
props, ≥ 3 tiles off the square; examine spots reachable and away from doors; creature routes on
walkable ground, off doorsteps and out of the square; Requin in water, frogs on the shore, Opal on
the river, Cilantro outside the wall; Polly on lamps; ghost queue clear; lantern placement; clock /
phase determinism; a grep that egg code never touches network, other entities or game state; 1x
sprite sizes = kinds, 2x = exactly double.
