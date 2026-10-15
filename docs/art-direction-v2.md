# Clocktower Town — working art direction, revision 2

Status: **The user approved the square direction and removed further approval gates.** Continue autonomously in the standalone art prototype; show milestones. Production integration is not yet claimed.

## Current scope

October 15 continuation: work in versioned `c-square-playable/v2/`; finish transitions, then depth/parallax, eight-direction cast, private interiors/homes, night voting, ambience and nearby gathering rooms. Simulate room membership/privacy locally, with no live audio or game connection. Keep the approved prototype unchanged.


Keep the exterior to the approved square. Rear paths lead smoothly to the player's home after the character disappears behind scenery or off camera; return through the same path. No residential map extension. Work remains in `packages/assets/ai/target/` and this document, without Node/pnpm. The user already used the reset.

The prototype now has source-preserving ground/building/foreground partitions, selected walk-behind masks, four-direction frog animation, six door targets and twenty seat spots. Browser tests verified movement, doors, seating, lamp occlusion and pier collision. Both rear-path home journeys and same-path returns were observed in-browser; the repainted native-scale home resolves the oversized furniture seen in the first placed-character test; full parallax, multiplayer and production integration remain unverified. Sol judges continue against both C and Octopath. Final bounded check: native-home desktop return and 390px touch return passed; clean desktop square restored. Home furniture-edge occlusion remains limited. Actual views: `playtest-square.png` and `playtest-home.png` in the prototype directory.

## Selected direction

October 15 visual checkpoint: Sol A/B preferred v2 (8.8/10) over the first clean plate (8.3/10), then accepted `target/blockout/studies/c-square-playable/clean-square-v3.png` (9/10) after three ambiguous entrances became explicit wooden doors. Further background-only edits were judged mostly nits. This accepts the background direction only. A standalone walking/door-approach art prototype now exists in that directory; it is not production integration. Desktop movement and tower/chapel checks, plus 390×844 touch movement and tower interaction, were observed in-browser. The v3 door targets follow the revised painted thresholds. This remains a single-character prototype: four-direction animation, selected walk-behind masks and a home interior are now implemented; multiplayer, layered parallax and full object occlusion remain unverified. Kit v2 remains geometrically too generic despite improved clock and camera anchors. Derive further custom masses and collision proposals from C’s actual silhouettes and door thresholds rather than forcing stock kit proportions. Keep using CC0 kit details where they fit.

**Square-first priority (latest user direction): reproduce C as closely as possible as a playable map.** This is the principal social space and takes precedence over completing the rest of town. Match C’s composition, overlapping architectural masses, greenery, intimate enclosure and light; do not accept a generic grid-aligned square with similar styling. Rear roads are home-transition exits; no residential exterior is planned. `target/blockout/layout-c-clone.json` is the current proposed layout; older kit studies are diagnostics, not accepted compositions. Validate the square’s doors, horseshoe seating and circulation alongside its appearance.

The user selected camera C in `packages/assets/ai/target/camera/camera-C-low.png`: a low, immersive diorama. C remains the town-square appearance reference. The **new geometric authority is the blockout**: orthographic, looking straight north along the street grid, zero azimuth, fronts and roof planes visible without rotating individual buildings into isometric views. Tilt is measured downward from horizontal and remains a test parameter until the camera/depth test is reviewed. Camera angle and zoom then remain fixed while following players. Earlier camera-study degree labels were prompt intentions, not measured renders; the existing runtime's 3 × 1.8 projection is a historical prototype, not the calibrated blockout camera.

Buildings need visible roof planes, deep eaves within their approved footprint, contact shadows, recessed entrances and varied overlapping masses. Do not invent side faces that conflict with the grid-aligned blockout camera. All elevation is painted illusion on one walkable plane. No crossing paths above or below other paths. Entrances face the camera; streets must accommodate groups and every door must have a clear approach. The painted wall base and door must match the collision footprint. Any enlargement requires a proposed footprint revision, not silent overhang into the street.

Move the tower behind the square. About twenty prototype seat positions form open banks in front of it, facing the tower, with clear circulation. Preserve clockwise seat ordering. The square should be the heart of an inhabited village, not an arena isolated in grass.

## Entrances and occupancy boards

Every enterable door must be recognizable from far away with no pulsing: substantial frame or awning, steady warm lantern or adjacent window, contrasting doorstep or mat, and light spill onto the path at night. Optional proximity cues supplement these static cues. Each door gets a small wooden occupancy plaque with brass hooks. Cottage artwork includes three empty hooks. The user has not yet provided the promised next point defining what occupancy tokens reveal; do not infer hidden occupancy or expose private visits. Design the short token-hanging motion separately from its eventual authoritative data source, with a reduced-motion alternative.

## Runtime contract

Bake shading, cast shadows, warm spill, glow halos and foreground/backdrop soft focus into images. Paint exactly aligned day/night variants. Allowed cheap runtime work: darkness/light-pool overlays, small light sprites, particles, a single grade/warp pass, crossfades, haze and restrained camera-centred depth-layer parallax. Prefer baked depth-dependent softness; do not add fixed top/bottom blur bands, full-screen blur chains, realtime per-pixel lights, or multipass bloom. Fade obstructing walls, roofs and canopies for visible characters only. Nothing visual at night may depend on the Storyteller's position, including pools, tint, particles, fog, roof fading or occupied-door cues.

Export separate layers under `packages/assets/ai/target/layers/<frame>/`: distant scenery, ground, buildings, upper architecture/canopies, soft foreground, and light/haze. The square prototype exports ground, buildings and foreground source partitions under `target/layers/square/`; complete independent object cutouts and parallax remain pending. Building day/night atlases and the baked-soft foreground atlas already exist, but are not substitutes for the requested scene layer exports.

## Reference frames

- **Town-square construction reference: `packages/assets/ai/target/camera/camera-C-low.png`.** The user explicitly wants this exact look, not merely its camera angle. Preserve this original unchanged and use it directly as an image-generation input for asset extraction and related variants; extrapolate its coherent world to other scenes. Build the square toward its architectural mass, receding ground, overlapping composition, warm light, atmospheric separation and painterly texture before judging. **Judges must use both Octopath and C as the reference set.** C does not replace or demote Octopath in judging. Do not declare success based on camera geometry alone.
- Square Enix, Octopath Traveler II: https://www.square-enix-games.com/en_US/games/octopath-traveler-ii — architectural scale and layered night atmosphere.
- Canalbrine: https://www.neoseeker.com/octopath-traveler-ii/sidequest/Waiting_All_Day_and_Night — intimate lantern-lit lanes.
- Timberain: https://www.neoseeker.com/octopath-traveler-ii/walkthrough/Timberain — steps, terraces and route clarity.
- Existing project reference: `packages/assets/ai/refs/mood-hd2d-atmosphere.webp` — quiet masonry, concentrated light and depth between planes.
- Interactive reference/camera gallery: `packages/assets/ai/target/camera/index.html`.

## Restraint, density and focus

The user's research notes describe insufficient early depth and a later version pushed too far in resolution/saturation. Treat those as warnings against solving flatness with stronger bloom or louder colour. Increase material/tile variety and overlap while keeping a restrained value hierarchy. The developer interviews on [Octopath I](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true) and [Octopath II](https://www.unrealengine.com/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style) are supporting research; our numeric settings below are proposed art direction, not claimed developer settings.

Use C’s smoothly drawn, painted, pixel-flavored illustration style. Match character scale and material/detail level across the cast and environments; there is no strict pixel grid, integer-upscale requirement or prohibition on high-resolution paintings with sprites. Preserve identical sprite canvases and foot anchors. Sol judging uses this rule.

Day/night pairs share geometry, camera, canvas, crop, alpha silhouette, anchor and layer boundaries. Relighting must not move an edge. Before acceptance, compare alpha masks exactly and difference-check edges at 50% crossfade; animated flames, flags and bell positions belong in separate strips rather than altered architecture.

Focus is based on camera-space depth and object identity, **not screen height**. A clock face extending into the top of the frame stays sharp when its tower belongs to the focus group. Use the blockout depth maps to paint offline foreground/backdrop softness. If live depth-aware focus is later used, it must be a bounded cheap alternative with explicit performance review; no full-screen blur chain is approved. Near characters and all names bypass haze and blur.

## Proposed depth falloff for the camera test

Values are starting points to test at the selected camera, not an accepted final look. Depth means signed ground-plane distance along the view direction from the player's focus region; the top of a tall nearby object is not classified as distant solely by its screen position. Preserve one near/mid/far classification for each connected building.

| Depth group | Camera parallax multiplier | Focus softness, native pixels | Day haze / contrast | Night haze / contrast |
| --- | ---: | ---: | --- | --- |
| Oversized foreground, noninteractive | 1.08–1.12 | 1.5–2.5, baked | 0–3% / 90% | 0–4% / 85% |
| Play space, within 8 tiles | 1.00 | 0 | 0–2% / 100% | 0–3% / 100% |
| Upper architecture, same building depth | 1.015–1.025 | 0 | Same as its base | Same as its base |
| Distant town edge, beyond 18 tiles | 0.90–0.96 | 0.25–0.75, baked | 6–10% cool grey / 90–94% | 8–13% blue-violet / 86–92% |
| Backdrop beyond playable town | 0.15–0.30 | 1–2, baked | 15–22% pale cool / 70–80% | 18–26% indigo / 65–78% |

Use four runtime groups: backdrop, world, upper parts, foreground. Distant town-edge treatment can be painted into world assets; do not introduce a separate scrolling layer for every object. Same-layer light halos and shadows use the same offset. Keep enough hidden paint around crop boundaries for the maximum drift; never pull roofs visibly off their walls.

All parallax offsets derive from absolute camera displacement relative to a recorded scene anchor and are applied around the **camera centre**. Do not scale around a texture's top-left corner or accumulate offsets per frame. On a camera jump, recompute from the anchor. The ground, doors and their interaction coordinates remain in the world group.

The proposed warp is one camera-centred projective transform: with normalized coordinates `u=(x-cx)/(W/2)`, `v=(cy-y)/(H/2)`, map `(u,v)` to `(u,v)/(1+k*v)`. Start `k=0.025`, test at most `0.04`: top-edge scale is about 97.6% (96.2% at maximum), bottom about 102.6% (104.2%). This is screen projection, not a change to collision or the camera's orthographic scale. Apply it once to the composed world; transform name/interaction anchors by the same function but draw their text crisp afterward. Picking uses its inverse. Use smooth sampling and consistent painted detail; reject settings that shimmer during slow walking. No integer scaling or pixel snapping is required. Do not assume a small warp is automatically stable.

## Character integration and visibility

Paint characters in neutral diffuse light with restrained highlights so a public baked lighting field can tint them. Sample a low-resolution day/night colour-and-shadow map at their feet and interpolate one tint per character, not per-pixel realtime illumination. Derive this field exclusively from fixed lamps, braziers, windows, sunlight and static geometry. Proposed tint bounds: daytime shadow value 0.78–0.88 with a slight violet bias; moonlight 0.72–0.84 with blue-grey bias; warm lamp influence blends up to 25% amber. Keep skin/material hues recognizable and avoid clipping warm highlights.

Provide a small soft foot-contact shadow for every visible character. Daytime adds a short directional component matching the blockout sun; night uses a compact neutral contact shadow. The local character and nearby visible characters have a minimum readable value, approximately 0.78 of their neutral diffuse sprite, adjusted by visual tests. This is self-visibility only: it casts no light pool and reveals no hidden entity. Characters within 8 tiles of the player receive no atmospheric blur/haze; names always remain crisp and high-contrast. Depth/occlusion may cover them normally, with the designated roof/wall cutaway revealing visible bodies.

The sun, moon, haze, illumination field, door lights and environment animations must be functions of public phase and static map data only. **No nighttime visual effect follows or samples the Storyteller's position.** Private-visit characters appear only in the authorized interior view; this rule does not authorize public visitor tokens or occupancy disclosure.

## Placement and walk-behind contract

Every building/tall prop manifest record needs a stable asset ID, category, map footprint in tiles, world transform, ground anchor, camera-space depth range, projected pixel anchor, ground-contact sorting baseline, fade-part IDs and an explicit collision-footprint provenance. Building records also carry the street interaction tile, painted door threshold, occupancy-board centre/hooks, door-lantern light positions and each lit window's position. Mark newly designed anchors as blockout-authored, rather than pretending they existed in the old map.

Use footprint geometry, never sprite bounding boxes, to place walls. Historical blockout units normalize one map tile to one Blender unit; this is a placement convention, not a required pixel density. A footprint is horizontal ground coverage, not the tall sprite's projected rectangle. Wall, roof, board and awning geometry must remain within the agreed horizontal footprint; lantern light radii may extend beyond it. Record any mismatch between generated map placement and newer layout source. Do not silently reinterpret a tall sprite's top-left as a ground coordinate.

The base/ground line defines sorting: a character north of it goes behind the structure. Fade only the documented roofs, upper walls, tower top and canopies intersecting an authorized visible character; preserve feet, door thresholds and nearby route cues. Per-layer depth must remain available because one global “all roofs above all actors” order cannot represent every overlap.

## Effects and moving-detail plan

The detailed machine-readable plan is `packages/assets/ai/target/fx/effects-spec.json`. Its texture/strip names are planned deliverables, not existing artwork. Create those after approved render-guided paint tests. These are initial budgets at a 1280 × 800 logical view, to be checked at phone size and in reduced-motion mode.

| Effect | Where / when | Density and appearance | Native size / speed |
| --- | --- | --- | --- |
| Lamp pools | Fixed door/lamp anchors; strongest at night | Baked amber falloff plus one cheap static pool; no pulse | Radius 1.5–2.5 tiles; static |
| Flames and embers | Braziers/lamps, public phase only | 1 flame strip per fixture; at most 12 near + 6 far embers visible | Near 2–3 px, 8–16 px/s; far 1 px, 3–6 px/s |
| Fog | Backdrop and distant streets; stronger at night | 2–3 oversized low-opacity banks, cool grey/day, blue-violet/night | 384–768 px; 0.5–2 px/s at distinct depths |
| Leaves | Tree-lined lanes; sparse daylight/bedtime | At most 6 near + 4 far visible, muted ochre/green | Near 3–5 px, 8–14 px/s; far 1–2 px, 3–5 px/s |
| Chimney smoke | Fixed chimney anchors | 2–4 puffs per active chimney, total cap 24; desaturated warm grey | 6–14 px; 2–5 px/s upward |
| Water | River/fountain surface mask | Repeating restrained highlights, no specular noise or full-frame effect | 32 × 32 tile strip; 6 fps |
| Flags/banners | Fixed hooks | Small edge movement; never move supporting pole or door cue | 6 frames at 5 fps |
| Bell | Tower belfry only on public bell cue | 8-frame strip, fixed pivot; no Storyteller-linked trigger | 8 fps for 2 loops, then neutral frame |
| Windmill | Its fixed site | Separate sails over static mill | 12 frames at 4 fps |

Flame strips: 8 frames at 10 fps; water: 8 frames at 6 fps; smoke: 8 frames at 6 fps. Mark pivots, alpha bounds, duration, loop behavior and neutral frame in each strip manifest. All frames share an identical canvas. Reduced motion keeps neutral flag/sail/bell poses and steady lighting, and disables traveling leaves/embers/fog while preserving readable static atmosphere.

## Small-screen acceptance

Review each keyframe at native size and a 390-pixel-wide phone preview. Check unprompted entrance recognition, all 15 silhouettes and names, the tower clock, routes around scenery, near/far walking and 50% day/night crossfades. Phone previews test consistent detail and scale, not a strict pixel grid. Simplify high-frequency trim, reduce particles or move scenery if doors or people stop reading. Record actual screenshots and judge findings; these are gates, not checked boxes.

## Historical prototype evidence — not blockout validation

Pass 1 runtime captures live in `packages/assets/ai/target/captures/pass1/`. Both independent Sol judges rejected them as a match to C: the oversized oval floor dominates, enclosing buildings are missing from the viewport, and rear-corner players/labels overlap. The response is to compact the plaza, bring tavern/cottages into the composition, quiet the clock inlay and paving, and add real upper-layer parallax. New 15-cottage art and door boards were not in pass 1.

Verified on hshi-u1 before the second layout iteration: `pnpm -r run typecheck`, `pnpm build`, and `pnpm exec vitest run packages/assets/test/layout.test.ts packages/assets/test/navigation.test.ts apps/server/test/world.stage.test.ts` passed (45 tests). Navigation included 113 routes. These results do not verify later edits or visual quality. Pass 1 staged browser frames measured roughly 16.6 ms mean/p95; this is one headless desktop session, not proof of mobile performance. Night screenshots intentionally remove public staged villagers and do not validate crowd readability.

For future production integration, continue actionable Sol visual critique until the result meets the references or remaining comments become minor/contradictory. Then use Sol agents for complete integration under primary-agent oversight and thorough gameplay playtests, including day/night privacy, all doors, route widths, labels, cutaway fades, fixed camera behavior, reduced motion and token behavior once specified. Do not announce completion before those checks. Do not deploy.

Before the workflow change, the integration agent passed 66 targeted routing/seating/privacy tests and exercised real keyboard movement into and out of all 15 cottages plus the tavern. The run was intentionally stopped at the user's new scope. Chapel, clocktower, shop and the final pointer test were not completed. Those results preceded subsequent art/layout work and do not establish current visual acceptance.

Historical preparation note (superseded by subsequent remote renders): the initial generator received static source review. Geometry fixes found through review include visible facade markers, an open belfry, exposed water surfaces, bounded building meshes, correct raised-ground contacts, one isolated shadow receiver, separate light-emitter anchors and finite depth-preview bounds. Subsequent render outputs exist under the blockout render directories. Remaining minor-prop stand-ins and neutral-ground material simplifications are documented in its README; the original atlas can be requested separately as a placement guide.

## Execution and continuation

When game integration is reopened, Mac remains editing-only. Builds and tests belong on `hshi-u1` through `scripts/remote.sh`, with `CT_AGENT=art-direction-v2`; preserve unrelated edits and use throwaway loopback test lobbies, never service ports 3000/3001. Current work uses the standalone browser prototype; production builds remain outside this stage. Remote Blender execution was subsequently authorized and performed.

An hourly overnight heartbeat was created for October 14–15, 2026, America/Los_Angeles: `clocktower-town-overnight-continuation`, ten runs. Its instructions now follow the blockout-first scope and must not render or resume game changes. The user subsequently used the reset personally; no reset action remains necessary.
