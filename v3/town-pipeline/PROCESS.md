# The multi-agent process that built Hollowmere

This is the order of work that produced the town, its interiors and the walkable demo, with the reason for each step.
Each phase maps to a script in `workflows/` (Claude Code Workflow tool: `agent()`, `phase()`, `pipeline()`,
`parallel()`, `workflow()`). Agents edited files on the editing machine and rendered on a separate GPU render host
(`AGENTS.md` §2).

```
foundation lead ─► one owner per piece ─► integrate ─► town critics ─► routed fixes ─► user-request verify loop
 (contract, kit,    (author → art-director    (lead composes,  (2 lenses,     (one fixer per    (independent verifiers,
  stubs, tools)      critic → refine; ~21      layout deltas,   whole town)    owner, parallel)  ≤ 3 rounds, fix between)
                     in a pipeline)            cut-away)
        ─► gallery ─► demo swarm ─► content (layout, interiors, intro, roster, player) ─► perf fleet ─► playtest ─► fix ─► ship
                      (demo lead + owners)                                                (QA + art)              (bundle, CSP)
        ─► continuous release: polish rounds against the live page, re-published from the tree every ~30 min
```

---

## Phase 1: Foundation lead (`workflows/town-build.workflow.js`, phase "Foundation")

One agent writes everything the parallel owners share. Before any owner starts, it produces:
- `docs/TOWN.md`: coordinates (1 tile = 1 m, +z = "south" = toward the camera), camera presets, palette ramps
  traced to the v1 2D art, piece API, kit, scale rules, budgets, ownership and the 12-criterion TOWN RUBRIC.
- `src/town/layout.js`: a faithful hand-port of the game layout.
- `kit.js`, `api.js` and the composer `town.js`.
- `scenes/town.js` and `scenes/town-piece.js`.
- `tools/townpiece.sh`, the one-command render pack that every owner and critic uses.
- **A stub for every piece**: kit cottages, a stone tower, cone trees and boxes.

**Why:** with stubs in place, the composed town renders from minute one. Every owner sees their piece in context
on the first render, a half-edited neighbour degrades to a grey box instead of breaking anyone's render, and
`stats.stub` shows which pieces are still placeholders. With the contract written down first, 21 agents can work in
one tree without touching each other's files.

## Phase 2: One owner per piece (phase "Pieces")

`pipeline(PIECES, author, critic, refine)`. Each item runs through three stages with no barrier between them:
1. **Author.** Reads the v1 2D source for the piece and writes a design note at the top of its file. Then it blocks
   out, renders and looks, models, and iterates at least 4 times, checking the gameplay camera, the 1x crop, night
   and a crawl. It fills in the anchors and API and stays in budget. It appends lessons to `TOWN_LEARNINGS.md`.
2. **Art-director critic.** An independent agent that edits nothing. It runs its own `townpiece.sh`, crawl, 1x crops,
   night shots and context renders, scores the 12 rubric criteria from 0 to 2 with pixel locations, and routes every
   issue to an owner.
3. **Refine.** The author fixes every issue it owns (all severities), re-renders, and puts other owners' issues into
   `contract_requests`.

**Why a pipeline:** a fast cottage does not wait for the slow foliage piece. **Why a separate critic:** authors grade
themselves generously. **Per-piece critics catch identity** problems ("the boot reads as a silo", "the toadstool
reads as a beehive"), but they cannot see the town.

## Phase 3: Integrate (phase "Integrate")

The lead collects every `contract_request` and every cross-owner critic issue, composes the town, fixes seams (lot
edges, palette clashes, z-fighting), and renders the integration set (`tools/townshots.sh --set integration`), a
crawl and a bench. In Hollowmere the integration rounds produced `LAYOUT_DELTAS`, the camera-aware cut-away, light
selection, the time-of-day retune, the quality tier, contact darkening and shadow-caster culling (`TOWN.md` §12).

## Phase 4: Town-wide critics (phase "Town critique")

Two art directors review the whole town in parallel, with different lenses:
- **architecture**: identity and distinctness as a set, cohesion, scale, silhouettes from the gameplay camera.
- **environment-life**: ground, foliage, props, light, night, animation GIFs, crawl, performance.

**Town critics catch occlusion**: the stacked side rows, the house in front of the voting circle, the south forest
rim covering the lower ring. None of these exist in a turntable.

## Phase 5: Routed fixes (phase "Fix")

The script groups issues by `owner` and runs one fixer per owner in parallel (plus the lead). Every fixer re-renders
in context (`?focus=<id>`) and in isolation.

## Phase 6: User-request verify loop (`workflows/town-user-requests.workflow.js`)

Write the human's requests into a **contract-doc section** (`TOWN.md` §11, "Notes from the user") and into the
workflow's `args.requests`, one verifiable sentence each. Then:
1. **Implement:** the lead applies all of them and checks each by rendering.
2. **Verify:** one **independent, skeptical verifier per request**, in parallel (`templates/user-request-verifier.md`).
   A request passes only if a demanding user looking at the renders would agree.
3. **Fix:** group the failed verdicts' problems by owner, fix them in parallel, and re-verify only the requests that
   failed. Run **up to 3 rounds.**
4. **Gallery:** a "User requests" table with every round's verdict, plus what still fails.

**Why:** the first answer to "make the circle visible" was a 1 m nudge, and the user had to ask four times. Verifiers
with one narrow question and no stake in the fix are what turned that request into PASS (house-9 finally moved 7 m
south into its own bay, with a 73 px lawn margin). Critics score the §11 section too, so the request is still
checked after the round that "fixed" it.

## Phase 7: Gallery

One agent renders the canonical set and writes `TOWN_GALLERY.md`: overview, iso and vote; the gameplay camera at 6
spots at noon and night; both quality tiers with `--bench 60`; life GIFs; a contact sheet; bench tables; the verified
request status; and **honest known flaws**.

## Phase 8: Demo swarm (`workflows/demo-build.workflow.js`)

The demo lead writes `docs/DEMO.md` (the store, events, input, boot order, URL params, playtest checklist) and stubs
for every module. Then owners build in parallel: player + camera, characters, time (continuous clock), UI, and
deploy (serve + smoke + playtest scripts). After that come integration, two playtesters (QA and art), routed fixes and
deploy. **Same trick as the town:** stubs first, so `demo.html` runs end to end before any owner starts.

## Phase 9: Content, perf fleet, playtest, ship (`workflows/demo-content.workflow.js`)

- **Content:** a layout lead (moves pieces, walk-through props, door fixes), a single-piece redo (the treehouse), an
  interior kit (contract + reference room + 14 stubs), then 3 interior builders of 5 houses each, the loading screen +
  cinematic, the full character roster, and the player (house entering).
- **Integrate:** the demo lead, then the scripted playtest.
- **Performance fleet of 3**, each owning disjoint files:
  - renderer / composition: draw calls, culling, passes
  - content geometry: triangles, LOD, casters
  - runtime / loading: per-frame JS, allocations, warm-up, hitches

  Each one measures a baseline first (both tiers, noon and night, square / side row / inside a house, plus a
  CPU-throttled laptop proxy) and re-measures after every change.
- **Playtest** (QA + art director), then **fix**, then **ship** the bundle.

## Phase 10: Finish and polish rounds (`workflows/demo-finish.workflow.js`, `workflows/demo-polish.workflow.js`)

- **Finish** (before publishing): an interior **lore pass** (3 builders against `docs/LORE.md`), a finished-only roster,
  a layout margin fix, an interior distinctness critic (25 % thumbnails), routed fixes, and the CSP-safe bundle
  verified under the exact production CSP.
- **Polish** (after release): night moods per room, light-disc "stains", a NaN geometry, a test-grid artefact, a
  shader program compiled late, room budgets, and framing next to the UI panel. One critic checks the night line-up.

## Continuous release

Once the bundle passes verification, the main session rebuilt and re-published it from the tree at a steady cadence
(about every 30 minutes). Polish workflows ran against the **live** page, and their agents were told: no commits, no
publishing, the main session publishes. This kept a working public build at all times, while fixes landed in small,
checked increments.

---

## Lessons learned (from `../pixel3d/docs/TOWN_LEARNINGS.md` and the run history)

**Process**
- **Stubs make the town render from minute one.** Write the contract, kit, composer and a stub for every piece before
  starting any owner. Failure isolation (a grey box on error, `strict=<id>` only for your own piece) lets 21 agents
  share one tree and one render host.
- **Per-piece critics catch identity; town critics catch occlusion.** You need both. Turntables cannot show that a
  neighbour hides your door.
- **Record user requests in a contract-doc section that critics score** (`TOWN.md` §11), and verify each one with an
  independent agent. Requests that live only in a chat message get "done" once and then quietly regress.
- **Interiors drift to a template** unless they get explicit distinctness rules and a lore doc. The first 15 rooms all
  shared the kit's rectangle and centre fireplace. `LORE.md` fixed it: an inhabitant, story props, shared motifs
  spread 2-4 per house, a per-room ambiance, and "vary the room itself". So did a 25 % thumbnail critic, run at
  night too (seven rooms had collapsed into the same blue-grey).
- **Usage limits: resuming a parallel workflow re-runs everything.** When a run dies part-way, do not resume the big
  script. Collect what failed (for example the unfinished fixers' issues by owner) and launch a small finish script
  with those args (`workflows/town-finish.workflow.js` takes `args.byOwner`), then chain the next stage with
  `workflow({scriptPath})`. Tell the fixers that their file may contain partial work.
- **Measure, don't argue.** Add review hooks (`?occl=1`, `?vis=1`, `?ldx=`, `?tris=1`, `?boxes=1`, `?treeDump=`) and
  run A/B parameter sweeps in one loop. Before chasing a crawl pixel count, check the magnitude: 1-3/255 is noise.
- **Benches on a shared host are noisy** (up to about ±1 ms; 13-16 ms under contention against 6 ms alone). Run
  interleaved repeats and compare medians.

**Camera and layout (30° orthographic pitch, yaw 0 looking north)**
- **Things south of a building hide it.** Height h at depth z covers ground up to z − 1.73·h. Keep the south rim low:
  cap rim trees by their DRAWN top (highest leaf base + one sprite), not by the height you asked for.
- **Side rows stack.** Turn the side cottages toward the camera (about 12°), stagger the rear one toward the square,
  turn corner cottages 45° to face the centre, and put side doors in 45° chamfers or south-facing porches ("turn the
  door, not the wall"). East and west walls are edge-on at yaw 0, so a lantern under a side eave is invisible.
- **"Move it slightly" is often not enough.** House-9's gable finial (5.9 m) hid 10 m of ground behind it. The fix was
  7 m south into a new bay, measured with `?occl=1`.
- **Tall pieces vs the 30° camera:** at viewHeight 12 only about 6.9 m of height fits above the target. Compress
  stages so that dials, belfries and doors stay in frame.

**Cut-away**
- **Cut-away needs outlined edges.** A raw discard leaves slivers and black slabs. What worked: a rounded screen-space
  window instead of a hard notch, a 1-px section rim on every cut edge, roof-off lifts for the cottage in front (whole
  parts by centroid, so no half-chimneys), BackSide section-interior twins in the mesh's own tone, a keep box for the
  focused cottage only (cut a neighbour's fragments even inside the focus box), and one clean cut plane per lifted
  cottage (1.1 m when its ground storey is in the way, 2.0 m when only the roof is).

**Performance**
- **Quality tiers must cut geometry, not just effects.** The first low tier only dropped god rays and fog, and it
  measured 1.34M tris on both tiers. What worked: a half-resolution terrain grid, decimated tree cores (`coreLo` /
  `coreFar`), dropping trunks far off-view, chunked merges so frustum culling works, soft dressing that receives but
  does not cast, and shadow-caster culling. Result: 0.36M tris at the square on low.
- **Triangles are in the tree cores, not the leaves.** Vertex-cluster decimation gives about 5x fewer triangles.
- **The program count must never change** (no new materials per mesh, no objects that first become visible at t > 0,
  a constant light count driven by intensity, shaders warmed behind the loading screen).

**Pixel-art geometry**
- 1-texel relief and 1-texel roof-course lifts render as dashed lines. Use 2+ texels (0.06-0.085 m on slopes facing
  the camera) and drop 1-px patterns under stepped courses.
- Coplanar faces and parts thinner than 0.05 m are the usual crawl culprits. Offset by odd hairs (0.013 m), make
  every part at least 0.05 m, and snap small objects to 45° stops.
- Sprites beat micro-geometry for small flora. Real leaf-sprite canopies on buildings (`createTree({add:false})`)
  read better than modelled foliage.

---

## Running the workflows

All scripts take `args.root`, the absolute path of `v3/pixel3d` (the caller computes it, for example with
`realpath ../pixel3d`). Optional args are documented at the top of each script. Typical sequence:

| step | script | args (beyond `root`) |
|---|---|---|
| build the town | `town-build.workflow.js` | `source`, `houses`, `renderHost`, `forbiddenHost` |
| resume dead fixers, then verify | `town-finish.workflow.js` | `byOwner` (`{owner: [issues]}`), `requests` |
| verify user requests | `town-user-requests.workflow.js` | `requests` (`[{id, text}]`), `rounds` |
| first playable demo | `demo-build.workflow.js` | `demoBind`, `demoPort` |
| content + perf + ship | `demo-content.workflow.js` | `source`, `layoutRequests`, `rosterHint` |
| finish before publishing | `demo-finish.workflow.js` | `publicUrl`, `csp` |
| polish after release | `demo-polish.workflow.js` | `fixes` (list of strings) |
