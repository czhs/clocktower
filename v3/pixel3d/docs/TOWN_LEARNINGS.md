
## house-0 (Stargazer's Tower)
- Round towers: kit `cylinder` 16-gon (default ry puts a flat face on +z) + `onTower(a)` frames (`M({at: [sin a·apothem, y, cos a·apothem], ry: a})`) to hang windows / corbels / ivy on individual facets. A 16-gon facet is only 0.57 m wide at r 1.45, so a door needs a projecting flat entrance bay (wallWithOpenings + a recessed interior plate behind the hole): the leaf then swings into the bay and an open door reads as a lit hall at night.
- Stepped cone courses (stacked open frustums with a 5 cm outward lift) gave dashed outline fragments AND hatched shadow-map stripes (light leaking through the lift gaps onto the chimney / ground). One clean cone shell + the `scales` pattern + a flatter bell-kick ring at the eave reads better and is crawl-clean. Small roofs (dormers < 1 m) should be two plain hexa slabs, not gableRoof courses (dashes at that size).
- Pointed-arch doors: one horseshoe `prism` (outer arch polyline + inner arch reversed, concave is fine) for the surround, a spandrel prism filling the rectangular hole above the arched leaf, keystone box. No overlapping boxes -> no coplanar flicker.
- Crawl ties found by `crawl.py --out`: a kit lantern at round coordinates and timber posts whose bottom face sat exactly on a plinth top (y 0.22 = 0.22). Nudging by ~1 cm (0.727 / 2.013, y0 0.237) fixed both; my piece is 0 px on a 3,2 texel pan.
- A separate tiny mesh with a stepped pose (telescope: new pose every 7 s, 3 steps at 4 fps) is a cheap, readable animation (+1 call); diff bbox confirmed only the scope pixels change between frames.

## house-7 (Toadstool Hollow)
- Stepped roof-style courses on a dome read as a beehive or layered cake, and 1-texel tiers came out as dashed
  rings. A smooth faceted dome (32 segments x 9 rings, no lift) plus one fat rolled lip at the rim reads as a
  mushroom cap; the lip gets the cream rim.
- paintRamp() of a saturated red gives a salmon-pink `hi` (it lerps toward cream). For a crimson that still
  traces to the palette, use hi = the listed accent (`toadstool #C8403A`) with mid/sh from paintRamp(v1 hex).
- A side door on a round wall: set the door in a shallow arched timber case turned 45-60 deg toward the camera
  (here 56 deg south of west). It reads clearly at yaw 0, and the case side face gives a dark frame. Doors in a
  solid round stalk can swing OUTWARD (own open(f)); the dark glass-layer interior plate behind the leaf glows
  at night.
- Crawl: after an irrational azimuth phase (0.0173 rad) on the cap facets, every remaining whole-texel-pan
  difference was <= 6/255 per channel: flat-shading derivative noise on grazing faces, not geometry. Measure
  the magnitude (max |dc|) before chasing pixel counts.
- Glass-layer window light anchors right in front of a curved red roof (the dormer) paint a saturated red
  disc on the roof at night. Only give wall windows a light anchor; keep roof/dormer windows emissive only.

## house-4 (Mossbank Cottage) - lessons
- Organic roofs (turf, domes): loft rings of a rounded rectangle (4 corner arcs x 4 pts + subdivided straight runs
  that bulge a little) up a sin/cos profile; 6 courses read well. Lift each course's lower edge 0.075 m (>= 2 texels)
  along the surface normal and add a down-facing lip quad: 0.05 m gave dashed course lines at the gameplay camera.
- Shaggy grass edges: do NOT hang separate teeth (each gets its own depth outline = rain-like dark streaks). Use one
  connected strip per edge whose bottom is a zig-zag (alternating 1/3-length and full-length teeth, 0.075 m apart)
  and TUCK the bottom inward so the strip faces down: it shades in the shadow tone and reads as a dark ragged line.
- Crawl (whole-texel pan) culprits found and fixed: (1) faces exactly edge-on at yaw 0 (a box chimney's +-x sides)
  flicker 0/1 px -> taper the stack slightly (hexa frustum); (2) sub-2-texel stems (0.05 m) -> 0.075 m; (3) tilted
  small discs (sunflower heads at rx -0.25) -> face +z exactly; (4) pointed pyramid tufts and randomly yawed tufts ->
  frustums with a flat >= 2-texel top, axis-aligned. Residual after that: ~5 isolated pixels on skirt / eyebrow edges.
- Keep the garden inside the footprint when the door row is a lane tile: inset the front wall ~0.55 m and stand the
  bed / bench / doorstep in that strip; only the flat doormat goes on the door tile.
- Builder.tris doesn't fix winding: for hand-made quads pass an outward hint and flip (tri() helper in house-4.js).
- kit tones: palette NAMES only for ramps ('ivory' is a single-tone accent: pass PAL.ivory, not 'ivory').

## house-3 (Ravenscroft) — learnings
- **Roof course lift 0.035 m (~1 texel) renders as dotted lines** on slopes facing the yaw-0 camera (the outline detector catches the step only intermittently). A lift of 0.06 m (2 texels) gives continuous course lines. Dropping the 1-px `shingle` pattern on roofs in favour of per-course runs with tint steps (0.96/1/1.04) removed the "- - -" speckle rows completely.
- **Steep roofs whose ridge runs along z** (front-facing gables at yaw 0): course edges turn into near-vertical screen lines, about 3 px apart with 0.26 m courses at 67°. Use about 0.45 m courses there, which puts the lines about 5 px apart.
- **Crawl hunting**: `crawl.py --out` plus a per-pixel diff of c0 against c1 shifted by the expected amount (-6,+4 at scale 2 for pan=3,2) finds the culprits. Mine were (a) coplanar contact faces (kneeler top = string-course bottom, crow feet = perch top): offset them by a non-round hair (0.013 m); (b) sub-texel parts (0.03 m legs, a 0.035 m beak): make every part at least 0.05 m; (c) small objects at arbitrary yaws stair-step: snap them to 45° stops. The leftover diffs were ±1 colour-level grade noise, not geometry.
- **Openings with depth**: `THREE.Shape` + holes → `ExtrudeGeometry` → `Builder.add` gives one slab with real pointed-arch / round holes (glass sits at the back of the reveal). Every body box behind an opening must leave the opening clear: my first wing box filled the door vestibule, so the open door showed a stone wall instead of the hearth glow. Check `?doors=1&tod=night` close up (`vh=5`).
- `paintRamp(hex, {lightness: 0.3})` keeps a dark v1 paint (oxblood oak) deep instead of candy-bright, and still traces to the v1 hex. Dark birds: build the ramp from existing palette tones, e.g. `[iron mid, iron sh, iron sh]`.
- Doorstep + mat together must stay within 0.40 m of the door tile: stoop 0.12 m onto the tile + 0.26 m mat.

## house-2 (The Weaver's House) - lessons
- **Cross gable on a hip / side roof without valley gaps**: cut the main roof's eave courses only where they sit in
  front of the gable FACE (|x| < gable half), and raise the gable's own eave (a plaster knee wall under it) until its
  eave edge at x = +-(half + overhang) is at or above the main eave courses. With both eaves at the same height the
  gable roof dips BELOW the wall top near its edges and you see grey notches (wall tops / attic) beside it.
- **Steep-ended hip ("half-hip") roof** = kit.hipRoof with a different tan for the two end slopes: per course the
  long side's half-length is `W - q * tanS / tanE`, the ends' is `D - q * tanE / tanS`; eave half-width
  `W = hx + ovS * tanS / tanE` keeps one eave height all round. Gives the v1 trapezoid silhouette with a long ridge.
- **Dotted course lines on roofs have two causes**: (1) a 1-texel lift (use 0.07 m), (2) ANY 1-px pattern on the
  hexa course: the pattern also lands on the 1-px course front face and turns the dark line under each rim into
  dots. `pattern: 'none'` + per-patch tint steps (0.95/1/1.04, patches 0.45-1.2 m) is clean and still reads as tiles.
- **Kit gableRoof rakes facing the camera** show the stepped course ends as a sawtooth: cover them with one flat
  bargeboard hexa per rake (offset -0.07..+0.13 m along the slope normal, 7 cm thick) - also the v1 look.
- **Shadowed fronts under jetties / hoods**: protrusions cast jagged shadow-map patches on recessed doors; move
  brackets so their shadow (falls right + down at noon) misses the door, keep hanging things off the door axis.
- **Crawl**: X-braces (St Andrew's crosses) and diagonal bargeboards with round endpoints produced 1-px tie flips;
  odd offsets (0.0431, 0.0617 ...) on the endpoints fixed them. Remaining diffs were 1/255 colour noise: check the
  magnitude (`max |dc|`) per pixel, not only the count. House region: 0 differing pixels.
- Swinging loads (the wool bale): own tiny Builder mesh under a pivot Group, `rotation.z` from a fixed table of 8
  poses at 3 fps (pure f(t)); its moving shadow is fine, static solids stay identical.

## house-1 (Wychwood Cottage) - lessons
- **Curved roofs (cones, witch hats, domes) as lofted courses**: build each course as a band whose top ring is a
  UNIFORM scale of its bottom ring about the band's own centre (`lam = min(hx1/hx0, hz1/hz0)`), so every facet is a
  planar trapezoid (no diagonal tone split inside a facet); the next course recomputes its true ring. Ring shape =
  superellipse with p from ~5 at the eave (rounded rectangle that covers a box house) to 2 at the crown; vertices at
  (i + 0.5) * 2pi / N so a flat facet faces +z.
- **Stepped courses on curved roofs: lift along the PROFILE NORMAL, not radially**. A radial (horizontal) 1.5-texel
  lift gave dotted / dashed course lines on the shallow skirt (the step barely changes depth seen from 30 deg up).
  Offsetting the course's lower edge by L * (sin a outward, cos a up) with L = 0.05 + 0.03 s (steeper crown courses a
  bit more) gives a continuous dark line + cream rim on every course, at every slope.
- **Tubes along a bent path (curled tip, horns, tails)**: clamp the tube radius to ~0.7 / curvature, or the rings on
  the inner side of the bend cross each other and z-fight: that was 6 crawl pixels on its own.
- **Coplanar timber faces flicker in outlines**: posts and rails with the same front plane make tie pixels under a
  pan; keep rails 0.02 m less proud than posts, braces behind both, and overlap a rail INTO the jamb it meets
  (no shared side faces). A kit gableRoof with `gableOverhang: 0` has its course ends coplanar with the attic
  triangle: use >= 0.07.
- **Moss / patch placement**: per-cell random patches look like confetti at 640x360; drive them with low-frequency
  noise on the cell's world position (plus a height bias toward the eave) so moss reads as clumps, keep odd
  replacement tiles (plum / red) under ~3 %.
- **Hidden-by-construction details**: a solid cylinder rim hides a liquid disc inside it (check the brew / water
  level sits ABOVE the rim top); a fire under a pot needs the pot raised on legs (~0.2 m) to be seen from 30 deg.
- **setLit without killing outdoor fires**: record the glass layer's vertex ranges as you add windows / door
  interior / jack-o'-lantern (`b.layers.glass.pos.length / 3` before and after) and zero only those `aGlow.w`.
- **Sheared (leaning) houses**: push a shear Matrix4 (x += k*y, det 1) on the Builder for the whole body; give the
  door leaf the same shear in its own pivot space so it still fits the opening and swings.
- Crawl: after these fixes the context pan shows 4 pixels at 1/255 magnitude only (measure magnitude, as house-2 says).

## house-6 (The Lantern-maker's)
- **Real fish-scale geometry only where the camera looks at it face-on.** A chamfered-tile slope (each tile's
  lower corners cut, lower edge lifted 1 texel) reads as crisp scallops on surfaces seen from above (the shop
  canopy at yaw 0, any slope at yaw 45). On the steep main slopes at yaw 0, the same notches turn into a grid of
  1-px rim dots, which sparkle under a whole-texel pan at golden (164 px of crawl). The fix: plain stepped
  courses with per-tile tints (0.95 / 1 / 1.05) on the main roof, and scallops on the canopy. The kit's
  `scales` shader pattern reads as blurry dots at both zooms.
- **Crawl hot spots were all sub-texel pairs:** a fascia top edge 0.008 m under the canopy edge, rope boxes
  overlapping at their joints, barrel hoops 0.03 m proud, a 0.02 m lid. The fixes: tuck the fascia into the
  slab, make the rope ONE flat ribbon strip with shared joints (`ribbonXY`), give relief of 1 texel or more, and
  delete the lid. The result is 0 px with `pieces=house-6,ground`.
- **Crawl-check your piece alone:** `town?pieces=<id>,ground&...`. With all 21 agents syncing, c0 and c1 can see
  different neighbour code (10k px of "crawl" that wasn't mine). Render both frames in ONE remote call (no
  re-sync between them).
- **West/east side doors and the lower-right neighbours.** At yaw 0, house-7's toadstool cap and its chimney
  pipe cover house-6's door tile, doorstep and door beacon from the gameplay camera, at any focus because the
  camera is orthographic. Only things above about 2.5 m on the door side read: the wrapped canopy roof and the
  side-eave lanterns. Check a neighbour's silhouette before relying on low entrance cues.
- **Lanterns hung under a pent are invisible at yaw 0** (the pent is between them and a 30°-down camera). Hang
  them from the outer edge, or give the door its own lantern on an iron arm above the canopy.
- **Dark wall material:** `paintRamp(v1 '#342b3c')` came out the same purple as the plum roof. The `iron` ramp
  with `boards` gives v1's soot-dark weatherboards and lets the cream trim and plum roof separate by value.
- **Glow colour for signs:** `glow[0]` (#FFE6A8) at night reads pale or white and `glowKind 2` dims it to 0.78.
  Use `lampGlow` steady (kind 1) for the hero lantern and keep the flicker for the small ones.

## house-5 (Elderhollow Apothecary) — 2026-10-15
- **Look at your ctx shot before designing the façade.** House-5's south gable (bay window, plaques, attic light) is
  completely hidden at yaw 0 by house-6 directly in front (z 20-25, ridge ~6 m). From the gameplay camera only the
  roof top, the chimney/flue and a ~0.5 m strip west of house-6's eave (x 39.2-39.75) are visible. Side-row houses
  5-8 / 10-13 stand in each other's line of sight: put identity in the roof skyline and in that lane-side strip.
- A **cross wing on the door-side slope** (ridge along x, gable to the lane) is the part the camera sees past the
  house in front: its south slope faces the camera and its courses run across the screen (they read as slate; main
  slopes facing ±x show courses as vertical stripes). Clip its outer gable (jerkinhead) so its silhouette reads as roof,
  not as a box: an unclipped wing gable end is edge-on at yaw 0 and the wing looks like a pale rectangle.
- **Course steps on faces that look straight at the camera** (south hips, a 60-67° south slope) get no outline line
  when the lift is < the outline depth threshold (0.02 m + 1 texel = 0.053 m at vh 12): they turned into dashed pattern
  rows. Lift 0.085 m (thickness ≥ lift + 0.03) gives one clean line per course. Oblique slopes are fine at 0.035-0.05.
- **Kit helpers return frame-local points** (`window_().glowPos`, `lantern().pos`): when called inside `b.push(frame)`
  apply the frame matrix yourself before turning them into anchors.
- A kit wall lantern on an east/west wall sits under the main eave and is invisible from yaw 0; hang it ≥ 0.45 m out
  (e.g. from the door hood's gable) so it shows and glows. Same for signs: a hanging sign on a bracket perpendicular
  to a side wall shows its full face to the camera and is the best side-door cue.
- Swinging sign: a separate tiny Builder mesh (+1 call) rotated about its bracket axis, stepped 4 fps with per-gust
  amplitude from floor(t/2.5); frame diffs confirm only the sign texels change.

## house-9 (Gloamend Clockworks)
- Standing-seam metal roofs: real ribs along a 45 deg slope (0.05 m square OR diamond section, 1-2 texels) rendered
  as dashed / grey-and-dark broken outlines at the gameplay camera: square ribs have faces exactly edge-on at yaw 0,
  diamond ribs sit right at the depth-outline threshold. The kit's 1-px `vboards` pattern (scale 2 = 0.36 m seams)
  plus real hip / ridge ROLLS (beam 0.07-0.1 m, tint 1.05) reads cleaner and is crawl-free.
- Roofs written as one flat slab per slope (hexa with a vertical drop) instead of courses: no course overlap, so no
  coplanar z-fighting when lift = 0 (kit gableRoof/hipRoof extend each course 0.02 m into the next: with lift 0, as
  in ROOF_KINDS.copper, those overlaps are coplanar). A parapet / frontispiece gable needs the front eave band split
  at a constant z just behind the gable's back face (cut x a little INSIDE the gable, 1.28 vs 1.30, so no slit and
  no coplanar end face).
- Shop windows that show their goods: no glass in the bay facets, only posts / transom / fascia, and a glass-layer
  back plate (paintRamp of a dark v1 velvet) on the wall: by day the clocks read against the dark back, at night
  they silhouette against the glow. Keep display objects clear of the corner posts (they hid a case clock).
- A clock dial face in the glass layer with cream/ivory tones = cream by day, glowing at night, dim when
  setLit(false). Hands = 2 tiny separate meshes on pivots; a ticking sign gear = 1 mesh rotated in its plane in
  quarter-tooth steps at 4 fps: frame diffs confirmed only the sign's pixels change.
- Lower-ring occlusion budget (h <= 0.577 z - 13.6) is tight for a tall front feature: plan heights per local z
  (back eave, ridge, chimney pot, finial) in the design note; the stepped gable at the FRONT wall can reach ~5.9 m.
- Crawl: after the anti-tie offsets every whole-texel-pan difference on the piece was <= 3/255 (derivative noise).

## house-11 (Fernlea Oak) - lessons
- A real leaf-sprite canopy on a building: `createTree(engine, {kind: 'round', add: false, height, radius, seed, palette: town leaf ramp})`, then remove its `trunk` child and add the group to your piece: +2 draw calls (core + leaves), same programs as the foliage. You cannot rotate a tree group (leaf sorting uses local positions vs the world camera forward), so pick the SEED instead: replicate `crownLayout` (rng((seed*2654435761)>>>0), a0 = 2nd draw, ...) in a tiny node script and search for a lump arrangement (here: no upper lump in front, lower lumps at 45/135 deg flanking the cabin). Shift the crown ~1 m behind the cabin: front lumps then frame the gable and a few leaves spill over the wall corners like ivy.
- Furrowed trunk = a 24-column loft whose column radii alternate ridge/groove (x0.92..1.05) with a 0.94/1.05 tint per column; flatten the columns (x0.97) where the door / window sit and clamp the root flare in the door sector, otherwise bark pokes through the door case and hides the interior plate.
- A side door in a round trunk: deep arched timber case at azimuth 55 deg (35 deg south of east) reads at yaw 0; the glass-layer interior plate must sit IN FRONT of the bark surface (check `doors=1&tod=night` close up: mine was first buried behind the bark and the open door showed nothing).
- Crawl hunting in context: the 'pieces=ground,<id>' town render removes neighbours' (and stub rim trees') shadows from the diff. Remaining 32 px (16 texels) on my deck are shadow-edge flips of lit plank vs shadow; not removed by turning off the crown core shadow or the rails' shadows (moved rails/rope/wires into a no-shadow mesh anyway: 2-texel posts gave busy striped shadows). Unresolved, magnitude ~25/255.
- Thin parts < 0.05 m (iron wires 0.03, vane rods 0.04) flip under a pan: keep every part >= 0.05 m.
- Ferns as flat 2-segment blades (up to a crest at ~0.2 m, droop to the tip, 8 at 45 deg stops) read as fern rosettes; tall thin arched beams read as spiders.

## house-8 (Hearthstone Cabin)
- Octagonal logs (kit `cylinder` 8 segs inside `b.push(M({rz: -PI/2}))` / `{rx: PI/2}`, apothem 0.13, pitch 0.24 so neighbours overlap 2 cm) give a real log wall: hi upper chamfer, mid front flat, dark V groove, all from the toon bands. End grain = a 3.5 cm disc of `dial` at 0.74 x the log radius, so a 1-px bark ring + outline shows round it.
- SHADOW ACNE ON FINE RELIEF: with the logs casting shadows, every log front flat fell to the shadow tone (the backfaces of the next log sit within a shadow texel of the lit face). Fix without touching shared code: logs in their own Builder built with `castShadow: false` (+1 draw call), plus hidden core slabs (|z| <= 0.05 m from the log centre line, i.e. inside the logs and their grooves, with the window/door holes cut by `wallWithOpenings`) in the main Builder that cast the wall's shadow instead. Diagnose with a temporary `receiveShadow=false` / `castShadow=false` URL toggle and `debug=raw`.
- At yaw 0 the west eave (overhang 0.42) hides everything under it within ~(eave - h)/0.577 m north of its front end: a wall lantern and most of a woodpile disappeared. The side door read came back with a pent hood that starts under the main eave (raise the eave so it fits above the door head) and projects past it (0.53 m beyond the footprint) plus a lantern hung from the hood's outer SOUTH corner.
- A side door can't sit centred 0.5 m from the front corner when the corner is a log crossing (needs ~0.3 m of wall): door centre is 0.28 m north of doorPoint, still on the door tile.
- Crawl: a whole-piece offset (group.position + a few mm) changes which round values tie; I tried 5 offsets (4-14 px) and kept the best. The residual 4 px are on cast-shadow edges across log faces (shadow-map texel ties), not on geometry edges.
- The south rim of house-8 is the cart road (z 34-36) and the lanes flank it on x 29 / x 34: the chopping block + axe went to the grass behind (z 28), the woodpile inside the footprint's 0.25 m west strip.

## house-14 (Millrace Mill)
- **Check who stands between your front and the camera before placing the signature.** At yaw 0 everything of house-14 left
  of world x ~5.3 below ~3 m is hidden behind house-13's roof (z 14-19), at any focus (orthographic). The v1 wheel sits on
  the LEFT; in 3D it would have been invisible. Mirroring the composition (wheel + flume + sluice pier right of the door,
  lucam + window + sacks + millstone left) kept every v1 element and made the wheel the first thing you see. Rule of thumb:
  a point at height h on a front at z0 clears a neighbour of height H at z1 only if h > H - 0.577*(z1 - z0).
- **Thatch that does not read as planks**: course 0.6 m (fewer, bigger bundles), 2-texel lift, `soft` layer (depth outline
  only, no cream rim per course: rims on every course = boards), the kit `thatch` straw-streak pattern on the course TOP
  face only (own hexa variant `hexa2(b, corners, topOpts, restOpts)`: the pattern on the 1-texel lip turns course lines into
  dots), a fat 0.26 m eave course, and a rounded roll along each hip that hides the half-hip sawtooth. A block-cut ridge band
  (one concave `prism` per slope with a zig-zag lower edge, in a slope basis built with `Matrix4.makeBasis`) + liggers reads
  as the v1 decorative ridge at 640x360.
- **The thick eave hides the upper storey**: the bottom of a 0.26 m eave course sits ~0.13 m lower and ~0.22 m further in
  than its top edge; a band window under it showed 2 px. Raise the eave (3.4 -> 3.65) rather than thinning the thatch.
- **Water wheel = its own Builder mesh under a pivot** (rings: `THREE.Shape` + hole -> ExtrudeGeometry, 16 tilted bucket
  boxes, 8 spokes, iron hub), `rotation.z = floor(t*6) * 2pi/48` (pure f(t), 7.5 deg steps). Falling water / foam / ripples:
  3 prebuilt geometries swapped on ONE mesh (`mesh.geometry = geoms[floor(t*6) % 3]`), 1 draw call.
- Crawl: the only real (96/255) crawl pixels were two overlapping coplanar water-drop boxes (z-fight under a pan): stagger
  overlapping small boxes in depth by an odd amount (0.031). Everything else on a 3,2 pan was 1/255 grade noise.

## clocktower (The Clocktower)
- **Tall pieces vs. the 30° camera**: at vh 12 only ~6.9 m of height above the camera target's ground point fits on
  screen, and things north of the target sit higher still. A 17 m tower with its dial at 6.4 m put the dial off-screen
  whenever the player stood on the lane in front of it. Compressing the stages (dial centre 5.45 m, spire apex 15.6 m)
  keeps the dial mostly visible with the target at z 10.5 and lets `focus=clocktower` show bell, parade and spire base.
  Check `town?focus=<x>,<z just in front of the door>` as well as ctx.
- **Side-face relief shows as slivers at yaw 0**: anything proud on an ±x face (a side dial's bezel, slit sills)
  becomes a 1-4 px coloured vertical line beside the wall. Either keep it ≤ the front corner's projection, or make
  the corner quoins project further (0.17 m "quoin pilasters") so they hide side relief, and give the cornice above
  more projection than the pilasters (otherwise coplanar faces).
- **Clock hands for N dials in 1 draw call**: rebuild one small merged Builder mesh in `setTime` (only when the
  minute changes; dispose the old geometry). Same shared kit material, so programs stay constant; no pivots needed.
- **Dial face in the glass layer** with `tones: 'cream'` + `glow: glow[0]`: cream by day (toon-lit, no outline,
  FLAG_NONE), a flat warm emissive face at night; hour marks / hands in the solid layer on top read as dark iron.
  A `lamp` light anchor 0.6 m in front of the dial gives the warm halo on the stone around it.
- **A bell inside a belfry sits in shadow and turns muddy brown** (brass `sh`). `build({receiveShadow: false})`
  on the bell mesh lets it glint gold like v1. Check what the camera can actually see through an arch: a ray
  through the arch apex drops 0.58 m per metre of depth, so hang the bell low and forward.
- **Crawl**: the only geometry tie was a box (parade walk) whose front face was coplanar with the pinnacle
  fronts over the same height range. Turning the walk into a projecting string course (+0.065 m) and starting the
  pinnacles on top of it fixed it; the remaining 4 px were 1/255 grade noise.
- A full-width plinth course box crossed the door opening and hid the bottom 0.34 m of the leaves. Cut such
  courses at doors (back + sides in one box, then two front runs either side of the surround).

## house-12 (Rookery House) - lessons
- **Crooked / leaning storeys**: push a shear Matrix4 (`x += k·(y - y0)`, stack several terms for "leans further each
  floor") onto the Builder stack: `b.push(shearMatrix)`. Patterns stay world-anchored, hexa winding is fine (det 1),
  and nothing ties under a pan (0 crawl px). k ~ 0.035 is invisible at 640x360. K1 0.05 above the ground floor plus
  K2 0.11 above the eave (apex ~0.5 m right of the gable base) reads as crooked and turns vertical timbers into clean
  1-px stair lines. Anchors must go through the same matrix (`v.applyMatrix4(SH)`).
- **Side door that the yaw-0 camera can see**: chamfer the door corner 45 deg (a prism outline with a notch for the
  vestibule) under the jetty's dragon-beam corner. The door half-faces the camera and its door tile. Viewed at 45 deg,
  the camera sees mostly a vestibule SIDE wall, so line the sides with glow plates as well as the back, or an open door
  at night shows a dark hole.
- **Tile joints on a steep z-ridge roof (gable to the camera)**: per-course runs alone read as standing-seam metal
  (vertical stripes). `vboards` on the course tops gives up-slope joint lines, so the slope reads as a tile grid at
  every yaw. But on a 53 deg slope fwidth(u) is ~0.145 m/px at the gameplay zoom (screen x drags z along with it), so
  the period must be >= 0.44 m or the kit fades the pattern out. It showed at vh 10 and vanished at vh 12 until
  `scale: 2.8` (0.5 m). Course lines stayed continuous (pattern lines on the edge-on step faces are invisible).
- Ivy: a sparse random scatter of clumps reads as a glyph ("&"). A jittered GRID of overlapping 0.12-0.18 m clumps
  inside a reach(y) envelope reads as one mass. Leave room for it: move shutters/windows off the corner.
- A small iron vane plate (prism silhouette) turning about y in stepped 3 fps gusts, plus ridge birds posed by whole-body
  rz (peck / caw) + yaw flips (always profile to the camera) in 1.5 s beats, costs 3 tiny calls. Frame diffs
  confirmed only those bboxes change.
- Side-row reality: the cottage in front (house-11's oak crown) hides this lot's door, lantern and woodpile in
  `ctx-noon`. No in-lot change fixes that; it needs the lead's camera-aware cut-away (TOWN.md §11).

## house-13 (Riverbend Boathouse)
- **Hulls / any lofted shell as a parametric surface P(side, u, v)** (u = girth gunwale..keel, v = bow..stern): one hexa per
  (strake, v-segment) with outer = P + n*lift, inner = P - n*thick, n from finite differences with its sign fixed ONCE per
  side at midship (a per-vertex "outward" test flips at the bow tip). Pick the strake boundaries by equal GIRTH (arc length)
  of the midship section, not equal u, or the flat keel strakes come out 3x wider than the steep topside ones. Lift the
  lower edge 0.075 m (shrunk with the local beam near the bow) = clean clinker lap lines; thickness <= 0.45 * beam + 0.02 at
  the bow so the two sides' inner faces never cross. Planks: tint steps only; "bare repair plank" patches in another ramp
  read as transparent blotches - dropped.
- **What a 30-deg yaw-0 camera sees of a shell is roughly proportional to n_y**: the steep topsides near the eave are
  edge-on and the bow (normals toward -z) faces AWAY from the camera. Put identity bands (paint stripe) where the surface
  already faces the sky (here the cream boot stripe at ~40 % of the girth), and add a silhouette cue that sticks UP at the far
  end (a carved stem head) - the pointed bow itself never shows from the gameplay camera.
- **A pointed plan needs walls that follow it**: derive the wall polyline from the shell (`x = 0.97 * beam(z) - 0.3`,
  bisection for the apex), one wall run per segment via a frame M({at: mid, ry: atan2(nx, nz)}) with the outward normal
  of a clockwise run; openings are only on the straight run.
- **Small side-door hoods: ridge OUT from the wall** (two hexa slopes, 2 courses each, cream bargeboards on the outer
  rakes): its south slope faces the yaw-0 camera. A sign board on an iron arm perpendicular to the door wall shows its face
  to the camera; hang it SOUTH of the hood or the hood hides it at 30 deg.
- **Identify a mystery shape at yaw 0 by its screen depth key `z*0.5 - y*0.866`**: two grey triangles "under" my sign were
  the open stern of the dinghy 2 m further back. Close open ends (transom plate) so they read as what they are.
- **Open doors need a floor**: with a hollow body the open doorway at 30 deg shows the ground inside the house; a
  glass-layer floor plate behind the threshold (same INTERIOR tone + fireGlow) makes the whole opening read warm at night.
- **Side-row reality check**: house-12 (z 20-25, ridge ~6.5 m) hides house-13's whole south end, door and transom from
  the gameplay camera; only the hull's west flank/top and the stovepipe show. Check `town?pieces=<neighbours minus the one
  in front>` to judge your own gameplay read as it will look with the lead's cut-away.
- Crawl: hull, nets (5 cm two-layer diamond lattice), cage and sign were clean first time; 12 px at max |dc| = 1/255 on a
  3,2 pan with `pieces=ground,house-13` (grade noise, no geometry).

## house-10 (The Old Boot)
- Organic "object" houses: a LOFT of cross-sections along the long axis (vertical walls + a superellipse top arc, n=3,
  8 segments) beside a separate octagonal shaft prism reads well; the interpenetration line between the two solids gets
  an outline for free (reads as the quarter/vamp seam). Wind the loft quads with a Newell normal vs. an inside point.
- Side door on an organic shape: keep the south wall's z linear in x over a stretch of sections -> the wall is a true
  vertical 45-degree plane (a chamfer) inside the loft; put the door surround + glass-layer interior plate + an
  OUTWARD-swinging leaf on it. No hole needed.
- Profile proportions decide the read at yaw 0: the first pass (shaft cuff 4.4 m, foot 2.9 m) read as a jug. Tall,
  narrow shaft (cuff top ~5 m, 2 m wide) + a foot that follows v1's superellipse instep (2.7 m) down to the toe made
  it a boot. Keep the cuff band below the eave line by >= 0.4 m or the eave overhang hides it at pitch 30.
- Hip roofs at yaw 0: the +-x hip ends are seen nearly edge-on, so their stepped courses show as a vertical fence.
  Use courses only on the +-z slopes and one plain slab per hip end. Course steps need lift >= 0.12 m / thick
  0.15 m on a ~44-degree slope: the visible lip is lift * ~0.28 on screen, so 0.05-0.08 gave dashed dark lines.
  A shingle pattern under stepped courses adds a second, misaligned set of lines (dotted rows): drop the pattern.
- Crawl culprits (crawl.py diff, then diff magnitude per 20 px cell): coplanar fronts where sign posts entered a
  board of the same depth; two sole slabs overlapping with equal top faces; thin awning rods crossing sloped slabs;
  the kit door's 0.05 m strap hinges when the leaf is turned 45 deg (own leaf with 0.075 m straps fixed it).
  Everything left was <= 2/255 (flat-shading derivative noise).
- Small horizontal boxes laid on a curved/sloped top (instep "creases") read as pegs sticking up: skip them.

## dais (voting circle + Storyteller's dais)
- **State visuals in ONE extra draw call**: a custom emissive mesh built on `toonMaterial` (outline 'none', kit-glass
  style pure-replace blending so rtScene.a = 0) with per-vertex `aFx = (slot, kind, phase, layer)` + `aPivot`, and a
  `uniform float uLevel[72]` set in `update(t)`. Level 0 collapses a part to its pivot (invisible, no extra mesh), so
  every halo, candle, ghost-light, brazier flame, ember and the vote-sweep arc lives in one mesh / one program.
  Flames flicker in the vertex shader from `floor(uTime * fps)` with a different fps per layer (core fastest, the
  t3ssel8r fire trick); inner layers get `mvPosition.z += layer * 0.06` in `viewVertex` so they draw in front of the
  outer ones instead of being depth-hidden inside them.
- **Hidden-or-shown solids without extra meshes**: record a part's vertex range in the Builder layer
  (`b._layer('solid').pos.length / 3` before/after) and, at runtime, overwrite those vertices (positions collapsed to
  one point = hidden; `color` / `toneHi` / `toneSh` rewritten = recoloured, e.g. a dead seat turning to `iron`).
- **A long flat object pointing straight at the camera reads as standing up**: the brass clock hand at rest on XII
  (-z) lined up with the lectern and the rose's north point and looked like a sword stuck in the dais. Resting the
  hands at 10:10 (two hands, diagonal) fixed it and reads as "a clock" instantly.
- **Things beside a seat go on the side AWAY from the camera**: the seat marker (candle stake) sits 0.75 m along the
  ring on whichever side is further north (`a +- da` by the sign of sin a), so it never stands in front of a player.
- Driving the composer's PointLight from a piece: it is created after build from the light anchor; find it once at
  the first rendered frame (position match) and scale its `color` (the composer rewrites `intensity` for flicker).
- Occlusion note: seats 7 and 8 (bottom of the circle, x 21.2 / 23.8, z 25.9) are hidden behind house-9's roof at the
  gameplay camera; heads of standing players still clear it (the TOWN rule), the stones and their fx do not.
- Crawl: axis-aligned 8-gon seats (all the same orientation, not turned to face the centre), an azimuth phase on the
  ring blocks, >= 2-texel joints and >= 0.065 m stakes -> whole-texel pan max |dc| = 1/255 (noon and golden).

## props (street furniture) - lessons
- **Depth-stacked objects hide each other at the 30 deg camera.** Height h at depth z covers ground up to 1.73·h
  behind it, so the first (v1-faithful) gold stall, 2.8 m tall at z 15, hid the whole fountain at z 11-13. The fix
  was layout-neutral: an open-backed stall whose awning covers only the front half and stays at or below 2.3 m,
  plus a raised basin with water at 0.72 m. The check is `0.72 + 0.577·(z_back − z_water) > h_back`. Run it for
  anything you put in front of another piece.
- **Under an awning, wares need line of sight below the valance.** The ray from the goods (y ≈ 1.1) toward the
  camera rises 0.577 m per metre, so the valance bottom (≥ 1.7 m) must clear it at the awning's front edge.
  Hang items (garlic, a lantern) from a peg OUTSIDE a front post. Anything under the awning is behind its
  valance at yaw 0.
- **Real water in a raised basin is cheap.** Use `createWater(engine, terrain, {shape: polygon, reflection: false})`
  per basin. That is one low-res post pass and no extra scene render: 2 basins added 0 colour calls, and the bench
  stayed at 1.26 ms. The pass treats a pixel as water when the scene lies behind the plane inside the shape, so a
  second, higher pool (the upper bowl) works without interfering with the lower one.
- **Falling water**: pre-build N phase meshes (glass layer, `glow: null`, which means no outline and no glow) and
  toggle `mesh.visible` per stepped phase. Toggle the MESH, not its parent Group: `countDraws` traverses invisible
  groups and counts their visible children.
- **Thin vertical posts:** a tapered hexa post has a nearly vertical silhouette that tied on a pixel centre at one
  row (38/255 crawl). Turning a square shaft 45° (`box(..., {ry: PI/4})`) removes edge-on faces AND the
  tie, and at yaw 0 it reads as a lit-left / shaded-right post. Post tops level with an awning slab top showed as a
  1-px dash; stop posts 1 cm under the slab.
- `kit.cylinder` ignores `rx`: for a disc facing the camera use `prism(octagon points, depth)`.

## foliage (forest rim, trees, bushes, sprites) - lessons
- **Hundreds of createTree() trees, few draw calls:** build ~30 templates with `createTree(engine, {..., add: false})`
  and stamp them (quarter-turn yaw, 0.85-1.15 scale). Then merge the parts: one leaf InstancedBufferGeometry per
  16 m chunk (every tree shares the cached 'leaf' material, since tones are per-instance attributes), one core
  mesh per palette and one trunk mesh. Transform `aBase`/`position`/`aLeafPos` with the full matrix and
  `aN`/`normal` with the rotation only. createTree registers a per-tree re-sorter in `engine._treeSorters`, so
  truncate that array back after each template and re-sort the merged chunks yourself when the yaw or pitch
  changes. The whole forest (about 560 trees) is 15-38 colour calls.
- **Triangles are in the cores, not the leaves.** A round tree's core is about 1.6k triangles (9 icosphere-detail-2
  blobs) and a pine's is about 540. With 600 trees that is 400k+, far more than the leaves cost. Vertex-cluster
  decimation (0.42-0.5 m cells, attributes averaged, normals renormalised, `aOcc` max) gives about 5x fewer
  triangles. Use it on every tree the build camera cannot see and on all trees at viewHeight > 20; nobody can tell.
- **View-dependent leaves:** project each tree's bounding box with the camera's right/up vectors (3 m margin) and
  give leaf sprites only to trees that can be on screen. Off-view trees keep the core, which is lit with the same
  4 leaf levels, so a pan reveals a smooth crown rather than a hole. Their shadows stay. Also cull each leaf that
  lies inside a neighbour's opaque core, using a polar (8 sector x 0.25 m) radius profile per template.
- **A south-rim cap has to use the DRAWN top.** That is the highest leaf base plus one 12-texel sprite (about
  0.35-0.4 m at viewHeight 12), not the `height` you asked for. At pitch 30 a tree at depth z hides the ground up to
  z - 1.73·top. "Tops below the far edge of the cart road" therefore means
  `top <= (z - 35.4) / 1.73 + 0.1` behind a 0.7 m hedgerow. My first formula covered the whole road. The iso
  camera (yaw 45, from the SE) needs `top <= max(x - 44, z - 36) / 1.22 + 1.5` on the east and south belts.
- **Broadleaf rim trees in the pine ramp** read as one dark gothic wood. The bright leaf ramp (and the mossTuft tip
  tone) is kept for the town's own oak, bushes and hedge. With the bright ramp mixed in, the overview looked like
  a lime-green park.
- **Pixel sprites for small flora** (flower clumps, toadstools, tufts, ferns, berries, blossoms, ivy): one 16x16
  atlas whose R channel holds a pixel "kind": 0 = green (instance ramp), 1 = accent, 2 = accent highlight,
  3 = second accent (ivory spots / stems, yellow eyes), 4 = accent shade. One toonMaterial is cached on the engine
  (a new toonMaterial is a new program), there is one InstancedBufferGeometry per field, and the root is snapped
  to the world-anchored texel grid as the leaves are. Toadstools as 3D kit geometry at 0.2 m would be outline
  soup; as 8-px sprites they read instantly. Berry and blossom dots on bushes are a second field drawn after the
  leaves (renderOrder 3, view push 0.42 m), placed on upward-facing leaf bases of the bush template.
- **Gothic dead snags** (tapered square limbs rotated 45 deg about the axis, forking at 45 deg stops, every part
  >= 0.06 m) only read where nothing crowds them. Placed between the top-row pines on both sides of the clocktower,
  they make the strongest "Hollowmere" silhouette at golden hour, and their branch tips are crow perches.
- Coordinate with the ground piece: it publishes `api.clear(x, z)` (river, banks, road, bridge). Keep trees and
  forest-floor sprites off it, or the river shows as pale holes cut through the canopy.
- Crawl: the forest, hedge and sprites are 0 px on a 3,2 texel pan. The only differences in my test frames were
  the ground's river surface.

## ground (terrain, square paving, lanes, cart road, river)
- **Own heightfield + own ground shader, createTerrain-shaped API.** createTerrain only flattens circles and its zone shader is generic; the town needs a flat rectangle and a v1-specific floor. A 0.625 m grid (160 m, 131k tris) with smooth vertex normals + one `toonMaterial` whose `tones` hook decides every pixel from world position gives full art control at 1 draw call; `api.terrain` exposes `heightAt / normalAt / tonesAt / isGrass / zoneAt` so createGrass and createWater accept it unchanged.
- **Bake shape data, decide pattern per pixel.** An RGBA8 distance-field texture (0.12 m texels, each channel a linear SDF clamped to ±0.6 m: lanes, cart road, forest floor, + grass-variation noise) bilinear-filtered and thresholded at 0.5 gives smooth, organic borders with no tile grid; the JS side samples the same bytes, so grass tones and masks match the shader exactly. Per-tile layout decals (crack / pebbles / leaves) ride in a 64x64 nearest texture.
- **1-px joints that are 1 px TALL on horizontal edges:** measure distances in screen pixels, not metres. `px per metre along world dir n = length(vec2(dot(n, camR.xz), dot(n, camU.xz))) / texelWorld` (camR / camU from `viewMatrix`); a joint is `edgeDist * pxPerMetre(edgeNormal) < 1`. World-anchored decisions with screen-pixel widths are crawl-free (0 px on a 3,2 texel pan) and keep the look at every yaw.
- **Concentric setts** = polar cells about the voting circle (course 0.34 m, stones 0.44 m, per-course angular offset); edge distances radial (`fr * cw`) and tangential (`fa * 2πr / n`), rounded corners where both are < 1.8 px, a 1-px sun-side rim (dot(edge outward normal, sunXZ) > 0.3 -> kerb hi) and shade rim. LOD: when a stone is < 4.5 px, draw one tone per band of 3 courses + a 1-px joint between bands only -> the overview shows clean rings instead of speckle.
- **Lane setts**: two-pass voronoi (iq's border distance) gives the exact border normal for the px conversion; near the path SDF edge the grout turns to earth / moss and stones darken one step = setts sinking into a worn-earth verge.
- **Pixel-size LOD for litter / specks:** leaf-litter cells of a fixed WORLD size become dense speckle at the overview camera. Use `cell = max(0.15, texelWorld * 4.5)` so the density per pixel is constant at every zoom.
- **Hill bugs found by a zone debug view** (`?groundDebug=1`: red = steep, green = lane SDF, blue = forest): (1) a side-of-rect classification (`x < x0 ? -1 : ...`) for the hill height made cliffs along the rectangle's corner diagonals: use the continuous outward vector from the nearest rect point; (2) river valley walls `bankW` must grow ~2.3x the hill height or the steepest band of the wall turns into a long "rock" tongue; (3) a road-corridor height scaling made a silhouette crease (dark 1-px scratch). Rock tone on a smooth terrain surface reads as a flat grey blob: keep slopes under ~35° unless you build real rock geometry.
- **Water**: createWater with `seed` flood-fills the carved channel (level -0.32, bed -0.85, banks rise over 1.4 m to the town floor at x/z -0.6). The reflection costs a full scene render: toggle `water.pass.enabled` per frame from `viewArea()` (the river is off-screen at the square). Reeds = a second createGrass (`scale 1.45`, `renderOrder -9`) limited to the waterline band, built only when the river is in the build view.
- **Moving accent on water** (moored rowboat): own Builder mesh, `camera.snapObjectToTexel(boat)`, y offset from a fixed 8-step table at 3 fps in whole texels (`1.15 * texelWorld` = 1 screen texel at pitch 30°).
- **Seen from the gameplay camera, anything south of a feature hides it**: a tree of height h at z covers ground up to z − 1.73h. The south reach of the river (z ≈ 41) only shows if trees south of it keep h ≤ (z − 42.6) / 1.73; `api.clear()` also keeps a 3.4 m meadow strip on its far bank.

## house-3 (Ravenscroft) - critic-fix pass lessons
- **The third band on a roof plane facing the camera:** when the front plane and the lit end plane both land in the hi
  band, give the front plane a ramp shifted down one step, `[mid, mid, sh]` (built from the same palette ramp). That
  gives lit end = hi, front = mid, shaded side = sh with no new hues and no normal hacks.
- **Hip edges stepped in ragged 2-3 px jags:** one straight capping hexa per hip line (from the eave corner to the
  ridge end, raised above the course lift, about 0.14 m wide) covers the stepped course ends and turns the
  silhouette into a clean diagonal. It costs 12 triangles per hip.
- **Small dark birds against dark roofs:** use the full iron ramp so lit tops land on iron hi, a pale nape box
  (stone hi) proud of the head top, and a pale iron beak, at a 1.4x scale (about 10 px bodies). Perch them on a
  cresting rail top or a lit kneeler, not on a shaded roof plane.
- **Fake a light pool without a PointLight:** the town keeps only 12 lights, so a house lantern can be dropped.
  Replace the top 12 mm of the stoop and mat, and the inner 35 mm of the hood mould, with glass-layer "skins": the
  same toon tones by day, a dim flickering amber at night (brass sh / glow sh). The skins have to sit on the SAME
  planes as the stone they replace. A 1-2 mm proud skin showed up by day as a dotted outline line (an intermittent
  depth step).
- **Per-piece crawl inside a town-wide FAIL:** diff c1 against c0 shifted by (-6,+4) inside the piece's screen box
  and print `max|dc|`. All of house-3's remaining pixels were 1/255 grade noise (0 geometry pixels).
- Bright flat cap cubes (buttress set-offs) stop popping out when you make them in the buttress's own stone ramp. The
  cream outline rim still marks the set-off.

## house-0 (Stargazer's Tower), critic round 2: lessons
- **A tower reads as a tower when it shows drum, not cone.** Lowering every companion roof by 0.3-0.5 m (wing
  eave 2.45 to 2.1, lean-to 2.0 to 1.7, bay 2.62 to 2.4), raising the wall top to 5.3 and narrowing the cone
  (eave radius 2.0 to 1.8) left about 2.2 m of stone visible. A machicolated crown also helps: a projecting
  parapet band on 16 corbels, each casting a 1-texel shadow. In the overview the house now reads as a "castle
  turret", not "a cone hat on a cottage", even next to house-1's witch hat.
- **Build a flared cone as ONE `LatheGeometry`** (eave, knee, apex). Separate kick and spire rings with a 2 cm
  radius mismatch produced stray partial outline lines parallel to the eave. The kit flat-shades everything, so
  you cannot get smooth normals; removing the depth step is what fixes it.
- **A signature finial needs about 0.35 m radius and 0.12 m depth** to be at least 6x6 texels at the overview
  and to get a lit face plus an outline. Anything at or above about 7.7 m on a top-row house is off-frame at
  `focus=<house>` vh 12 anyway (0.866·(h − 0.8) > 6). Judge the finial in vh 14 or overview shots.
- **Window and lantern light anchors go OUT and DOWN, not at the glass.** An anchor 0.3 m from the wall with
  r 1.6 painted hard discs on the drum and cone. Placing it 1.3 m out, 0.85 m high, with r 1.2 gives clean
  ground pools. The kit lantern's default r 3 also lit the drum above the bay. Override it in the anchor
  (pos +0.5 z −0.45 y, r 1.9). Upper windows and the lucarne rely on emissive glass only.
- **Make an open door read.** kit.door swings 100° about the jamb line, and its thickness rotates into the
  reveal stone, so the leaf disappears. Wrapping `open(f)` (swing ×0.88, hinge stepping +0.07 m off the jamb)
  keeps a teal edge visible. A vestibule needs real depth. I set the tower 0.15 m back and made the front wall
  the whole 0.55 m reveal. A dark floor strip, a newel post and the first stair steps against the glowing back
  panel give the open hall depth at night.
- **Crawl:** small things hung next to window shutters (herb bundles) and a shutter top at a round height each
  produced a 1-2 texel outline flip on whole-texel pans. Moving the window centre to y 1.413 and dropping one
  bundle made house-0 crawl-clean.
- **A parallel render tree changes under you.** Other agents sync the same remote tree, and their pieces (or life
  actors) can change between your c0 and c1 renders. Locate crawl diffs (shift-compare plus a magenta mark) and
  attribute them before chasing them. Use `life=0` for crawl pairs.

## house-1 (Wychwood Cottage) - critic pass 2 lessons
- **A shallow cone sits in the hi band all the way round.** With the town noon sun (relAz 150, elev 50) a brim
  sloping about 20 deg has N.L > 0.5 on the right flank too, so the toon bands never separate left from right.
  The fix is to paint the ramp per shingle cell from its own normal: d = N.Lp, with Lp = the camera-relative sun
  at a lowered elevation (-0.8, 0.42, 0.42 in camera right/up/back). d > 0.66 keeps the full ramp, d > 0.14 shifts
  it one step down, and anything lower shifts it two steps down (into cool sh plus a deeper slate). The shader
  still bands on top of this. Build Lp from `engine.camera.yaw` at BUILD time: the sun is camera-relative, so the
  painted light then matches at every static 45 deg stop (the yaw-90 turntable was backwards until I did this).
- **Radial "umbrella spokes" have two causes:** cells subdivided from the N ring segments, so their boundaries
  line up course after course, and moss noise sampled on (x, z+y) instead of on the surface. Lay cells out by ARC
  LENGTH along each course and stagger them half a cell on odd courses, splitting at the polyline corners. Choose
  the tone once per cell and paint it per quad.
- **Moss as hand-placed clumps** (angle, course, angular radius, course radius, with the course radius growing
  toward the eave) plus about 0.35 of edge noise reads as organic moss. A clump that is narrow in angle but tall in
  courses looks like a spoke again, so make clumps wider than they are tall.
- **Barcode on grazing flanks:** drop per-cell tint jitter and odd replacement shingles where |N.V| < 0.35.
  Painting makes each flank one flat tone anyway.
- **Course ledges on a narrow steep crown break into dashes.** Giving the top 3 courses no ledge (L = 0, no lip
  quad) and letting the band and cell tone carry them looks cleaner.
- **Logs lying along z look like vertical pipes from the 30 deg camera.** Use short rounds (0.4 m) as octagon
  `prism`s, which extrude along z, with a smaller daub end disc in front, stacked 4/3/2 under a lean-to board.
- A wall lantern made of iron reads as a dark blob by day. Give it amber glass tones (glowKind 2) and a brass cap
  with a cream finial texel, which reads at 1x. Put its light anchor about 0.45 m out from the wall, at r 3.8, so
  the pool reaches the step. For a dark door paint, lift the ramp's sh 45 % toward mid or it turns navy at night.

## life (the animation layer)
- **Pieces' update() runs before life's**: when life changes another piece's state (dais setSeat / setPhase, clocktower
  ring), re-run that piece's `update(t)` yourself right after, or the change shows one frame late (and never in a
  single-frame `--t` capture). The clocktower's own "ring when setTime crosses the hour" uses the frame time, which is
  not pure for sparse captures: call `update(t)` (consumes the flag), then `ring(exactT0)`, then `update(t)` again.
- **Program count must not change mid-run**: an object that first becomes visible at t > 0 (a crow pose mesh, a walker
  coming out of a house) compiles its shader then (dusk bench: 39 -> 43 programs). Hide walkers with `scale 1e-4`
  instead of `visible = false`, and in frame 0 give every instanced pose mesh one dummy instance at y = -200.
- **One CPU-fed point-sprite system** (`life/sprites.js`) for smoke / sparks / moths / water: positions are closed-form
  f(t) per particle (birth time hashed from the particle index, age stepped at the emitter fps), centres snapped to the
  low-res grid in the vertex shader, shapes drawn as masks on texel cells, `NoBlending`-style replace with alpha 0 for
  emissive cells. 1 call, 1 program for every life particle. Multiply non-emissive colours by uRampHi/uRampMid so
  they follow the time of day.
- **Smoke reads only as a column**: 3-5 texel puffs every 0.85 s were isolated grey specks. Puffs every ~0.33 s,
  5 -> 12 texels, rising ~0.42 m/s, oldest drawn first, a lit upper-left / 1-px dark lower-right rim, and a Bayer
  dissolve only in the last third give a lumpy t3ssel8r-like plume. Keep a minimum size of 2 at the overview zoom.
- **Crows need the iron mid/sh tones** (as house-3's rooks): the full iron ramp made them light grey with cream rims.
  Scale ~1.3x (a 0.4 m crow is ~13 px at vh 12); wing plates need >= 0.15 m chord or flying crows read as a thin X.
  Their cast shadows on roofs and setts sell the flight more than the bird does.
- **Door overshoot without touching the house code**: measure the pivot's rotation at open(0) / open(1), call open()
  with the clamped f and extrapolate that rotation axis for f < 0 / f > 1 (latch rattle, ~10 deg overshoot, slam).
- **Lane walkers**: A* on `layout.blocked` + string pulling gives clean lanes, but the plaza is walkable all the way
  through the dais: wall off r < 2.9 m round CIRCLE or villagers stride through the braziers.
- **Per-lamp light switching with no props API**: wrap each composer PointLight's `intensity` with a getter/setter
  gain (the composer's flicker keeps writing the raw value) and zero `aGlow.w` of the props glass vertices within
  0.7 m of the lamp. Light counts never change, so no recompiles.
- Only add water to a fountain if its owner has none: the props fountain had its own `water-fountain` pass and
  streams; extra droplet jets on top read as snow.

## house-7 (Toadstool Hollow) - revision after the art-director pass
- Smooth toon bands on a faceted dome: kit materials are `flatShading: true`, so vertex normals do nothing for
  lighting. Make one own `toonMaterial` (vertexColors + toneAttributes + flatShading + outline 'full') with
  `lightNormal: '(gl_FrontFacing ? vN : -vN)'` fed by a varying `vN = normalize(normalMatrix * objectNormal)`,
  build the cap with a normal Builder, then swap `mesh.material` and overwrite the `normal` attribute with
  analytic normals. The outline pass still sees the flat dFdx normal, so silhouettes stay crisp, while the bands
  become smooth curves (one extra program for the whole town; staircase bands and the cap crawl both gone).
  Surfaces of revolution: swing each face's flat normal to the vertex azimuth (lip, rings) - no math per shape.
- A cap's cast shadow on its own stalk is a shadow-map sawtooth and buries the sunlit flank. Put the stalk and
  everything on it in a Builder built with `receiveShadow: false` (the stalk still casts onto the ground) and
  paint the shade under the cap as a collar course with ramp [mid, sh, sh]. Same for the door leaf mesh.
- A door case proud of a round wall shows its outer side face as a dark slab that reads as an ajar door. Fill
  the gap with plaster wedge "cheeks" (triangular hexas from the case edge back into the stalk, inner edge tucked
  2 cm into the case so nothing is coplanar); keep the leaf within 1 texel of the case front; build the door ramp
  from the v1 hex at `lightness 0.3` (the default 0.4 lit a dark green to mint).
- Night entrance: a fanlight above a 2 m door hides under a cap lip at the gameplay camera. A glowing glass
  peephole on the leaf itself (its own tiny glass-layer Builder parented to the pivot, iron ring on the glass
  layer too = 1 call) always reads. Lantern anchors rank below props 'lamp's in installLights, so near a
  streetlight a house lantern's point light is culled: never rely on it alone.
- Crawl: test your own piece with `pieces=<id>,ground` too. In the full town the remaining diffs were all in
  neighbours' pieces; house-7 alone + ground = 0 px on a 3,2 texel pan.

## house-2 (The Weaver's House), critic round 2: lessons
- **Shadow-map speckle on a door has two separate causes; fix both.** (1) Small hanging things in front
  of it (lantern + chain): build them in their own tiny Builder with `build({castShadow: false})` (glass never casts,
  so keep the lantern's glass in the main glass mesh: +1 call only). (2) The jetty's big shadow terminator still
  crossed the panels as a stair-step on the isolated pad: build the door leaf with `receiveShadow: false`. A leaf
  in the doorway reads fine without a received shadow; a jagged one on the entrance does not.
- **Panelled door that reads at 640x360:** recessed field in a deeper `paintRamp` of the same paint (lightness
  0.24 vs 0.32), stiles / rails 0.035 m proud, raised panels 0.03 m on top (tint 1.05). That gives three tones plus
  outline/rim pairs. The kit 'panel' door (one tone, 0.03 m panels) reads as a flat slab.
- **Ribbon windows at night:** one glass box across 15 lights becomes a single clipped band. Draw one glass pane
  per light with drawn indigo curtains (solid layer, vboards folds) on 2+2 panes and `P.glow[2]` on the end panes.
  You get 3 lit clusters on `P.glow[1]` that line up with the 3 window light anchors.
- **Hip capping strips** (a hexa along each hip line, offset along the normalised sum of the two slope normals,
  -0.04..+0.15 m, width +-0.09, red tint 0.92) turn the ragged course-end staircase on a hip silhouette into one
  straight outline. The courses still read inside the slope.
- **Lantern pools:** the town PointLight is fixed (1.4, decay 1.5, toon-banded), so the only levers are `r` and the
  anchor position. Put the anchor low (about 1.15 m) and in front of the door (z + 0.6), not at the lantern
  itself. That warmed the threshold and step visibly; at 1.9 m it barely did. Check with a `&lights=0` diff.
- **A swinging load needs about 3-4 texels at its extremes to be noticed:** with roughly 0.6 m from pivot to centre
  that is about 0.17 rad, where 0.08 rad gave 1-2 px. Sacking (thatch tone) plus two timber-tone lashings and an
  ivory tuft reads as a bale. A smooth ivory cylinder read as a paper lantern.

## house-9 (Gloamend Clockworks), critic round 2: lessons
- **A "stray lit triangle" on a roof in ctx-noon can be a cloud-shadow edge**, not geometry. The critic's flipped
  hip corner was the only part of the roof outside a passing cloud shadow. Re-render with `clouds=0` before
  touching vertices; judge roof banding in the isolated iso-y000 (no clouds) and a `clouds=0` ctx shot.
- **Hip roofs need painted banding too** (house-1's per-plane trick works for flat planes): pick each slab's ramp
  from its top-quad normal against the camera-relative paint sun (`setPaintYaw(engine.camera.yaw)` at build):
  d > 0.66 full ramp, d > 0.14 one step down, else two steps (copper sh then two deeper cool slates). The front
  copper plane (d 0.59) now sits on the mid band, the lit west hip on hi, the east hip in shadow; before, all three
  were #8CC2A8 at noon.
- **Hip rolls: a 0.1 m diamond section (beam roll pi/4) 2-3 cm proud of the arris** gives a continuous stepped
  rim; a 0.07 m square roll rasterised as a dashed cream/grey line. Nudge endpoints by ~3 mm off round values.
- **Light anchors out and down, again**: the wall lamps' PointLight 0.24 m in front of the ashlar made brown discs
  and lit the copper canopies saturated green and the chimney base orange (r 3 reached 2 m up). Anchors at
  0.8 m high, 0.8 m out (r 2.3), and shop-window anchors at 0.55 m high, 1.15 m out (r 1.5), pool on the step,
  mat and lane, and leave copper / brick above them alone. Point-light warmth multiplied by a green albedo is
  always off-palette, so keep lights below coloured metal.
- **A lamp has to be its glass**: a 0.16 x 0.25 m glass-layer box (5 x 7 px at vh 12) with glow-ramp tones (amber
  by day, `lampGlow` steady at night) under a small iron cap. The kit lantern's 0.12 m glass under a wide cap read
  as a near-black body with a 1-px flame.
- **Ivy = a woody stem + irregular blobs**: a 0.04 m diamond `beam` stem (timber x0.78, soft layer) wandering up
  the quoins, 6-8-gon `prism` clumps (radius 0.1-0.14 m, jittered) in two tones (leaf / leaf one step down),
  3 per step at the foot thinning to 1, a side shoot round the corner and one tendril to the canopy. Stacked boxes
  read as green squares.
- **Two clocks in one town must agree**: follow the clocktower's `api.time` getter (minutes, 12 h dial) each
  update; houses build before the tower, so read it in update(), not build(). Fall back to a stepped f(t).
- **house-5 (round 2): PointLight discs on walls come from the anchor's distance to the wall, not its height.** A
  vertical wall facing the light gets N.L ~ 1 at its nearest point, while the ground under a low light only gets
  N.L = h/d, so lowering the anchor makes the wall disc relatively WORSE. What worked: put the anchor away from the lamp,
  out over the lane (1.45 m from the door wall, 0.4 m up, reach 2.4): the toon outer band (~1.35 m for r 2.4) stops
  short of the gable, and the pool still reaches the doorstep. A window anchor right in front of a bay paints a hard
  disc on the wall around it: drop it and keep the bay emissive only. The west (door) wall can still catch a sliver
  at yaw 300-330, but it is edge-on at yaw 0.
- **Coloured glass at night without new hues**: lerp each tint 40 % toward glow[1] (#FFC46B) for the `glow` value
  (keep the day tint as is). The bay reads as warm lamplight through coloured glass, not as pastel neon.
- **Wing valleys**: the stepped courses of a cross wing end in a ragged stair where they run into the main slope.
  One lead board per valley (a beam from the wing ridge point x = -(ridge - wingRidge)/tan to the main eave point,
  raised ~0.07 m, 0.22 m wide, roof tone at tint 0.9) makes every course stop on one clean diagonal.
- **Side-door hood that reads at yaw 0**: own hexa courses (2 per slope, lift 0.075, ridge OUT from the wall) + a
  0.1 m bottle-green fascia under each eave (a dark line under the blue) + cream barge boards proud of the courses on
  the outer gable. The kit gableRoof at 0.6 m wide read as a featureless pale box. Hang the lantern off the hood's
  OUTER south corner with a brass cap (it reads as a bright 4x8 texel lamp at noon, not a dark nub).

## house-11 (Fernlea Oak), critic round 2: lessons
- **The "shadow-edge" deck crawl was a coplanar z-fight, not shadows.** The trunk's top cap ring sat at y 3.0, exactly
  the deck top (box at 2.86 + 0.14). Bisecting with temporary `?h11=` URL toggles (deck receiveShadow off, crown
  and every piece caster off, all at once) left the 32 px untouched, which ruled shadows out; a 4x nearest crop of
  c0 vs shifted c1 showed a mauve (trunk-tone) blob through the planks. Top ring to 2.81 (under the deck) = 0 px.
  If turning every caster off does not change a crawl, look for a hidden solid poking through a coplanar face.
- **Bark that reads at 640x360:** column radii x0.86..1.07 with groove tint 0.9 / ridge 1.06, PLUS the kit
  `vboards` pattern (scale 0.55) on the trunk quads gives 1-px furrow lines that fade at the overview. A 1.35x foot
  flare must ease into the door sector (blend the clamp over 16 deg) or the case sits in a notch.
- **Roots as buttresses, not blades:** wedge hexas 0.6 m wide at the trunk with a crest 0.4x the base width, on the
  `soft` layer so the crest gets no vertical cream rim line.
- **Moss on a loft:** skins that hug whole bark columns (ring points scaled 1.035 radially) with ragged per-column
  tops and a mossTuft row on the crest read as moss; small boxes on a round trunk read as nothing.
- **Leaves over shutters:** moving the crown 0.4 m back, 0.2 m west and 0.35 m lower freed both shutters (the front
  lumps go behind the wall plane) and pulled the noon shadow off part of the lane. Shorten limbs after moving a
  crown: their square ends poke out.
- **Night side door:** lift the leaf 0.1 m (scale y to keep the arch top) and put a glass-layer glow sliver in the
  leaf plane under it; a doorstep top skin in brass sh (not glow sh: that was a bright orange disc) gives the pool.
- **Turning vane = 1 extra draw call** (own Builder, castShadow false), rotated in 45 deg stops from a table indexed
  by floor(t / 3.2): edge-on at 90 deg is fine, and it stays crawl-free.

## house-4 (Mossbank Cottage) - fix round lessons (real foliage on a turf roof)
- **Grass ON a roof = createGrass on a fake terrain.** Author the roof as a pure height field h(x, z) (superellipse hip
  metric s(x, z), pillow profile 1 - s^1.55, low-frequency lumps, a lumpy ridge), loft the mesh from the same function
  (rings = iso-contours of s), then hand createGrass `{size, center, isGrass: inside-roof mask, heightAt: h,
  normalAt: finite-difference normal, tonesAt: moss / mossTuft noise patches}`. One draw call, the shared grass
  program, stepped wind, flower clusters via the `flowers` option (patchScale ~1.3 for a 5 m roof). The shader uses
  WORLD aBase and ignores modelMatrix, so build it in world coords and just re-parent the mesh into the piece group.
  Tufts are invisible inside a band, so the roof still reads as clean banded turf, while band edges, the ridge and
  the hip silhouettes break into grass fringes; mossTuft tone patches + accent 0.2 give visible lighter tussocks.
- One continuous closed shell (no stepped terraces, no lift gaps) + a 3-texel sod edge + a fan soffit: the cast shadow
  has no holes and the "layer cake / beehive" read is gone.
- **Leaf-sprite clumps for moss, ivy and a sapling crown in 2 draw calls**: createTree(kind 'bush' / 'round', add: false)
  per clump, truncate `engine._treeSorters` back after each call, concatenate the leaf InstancedBufferAttributes (offset
  aBase by the clump position), merge the cores (translate position AND aLeafPos) and re-sort far->near yourself on
  camera yaw/pitch change. Re-tone instances per clump (color/toneHi/toneSh/aCore/aTip) to mix palettes in one mesh.
  Drop the core (`noCore`) for clumps that sit on a wall or roof: the surface behind fills the gaps, and it saves
  ~600 tris per clump (my piece went 16.2k -> 11.7k tris).
- Ivy: a jittered column of 0.10-0.15 m leaf clumps sunk 4 cm into the wall at a corner, width shrinking with height,
  reads as a real ivy mass (the leaves' 0.25 m view push puts the whole clump in front of the wall). The foliage
  piece's ivy() sprites were too wispy at this scale (thin twig glyphs).
- Small solids in front of a leaf crown (berries) are hidden by the leaves' view push: slide them toward the camera
  along the view ray (+0.5 y, +0.87 z per metre at pitch 30) by ~0.45 m - same screen spot, now in front.
- A wedge eyebrow: each arch segment a hexa whose front arc stands proud and whose back arc is clamped under h(x, z);
  let the legs (a near 0 / pi) reach down into the turf, or the side view shows an empty lip floating over the roof.
- Crawl: after the rebuild every remaining pan difference in my piece is |delta| <= 2 levels per channel (no geometry
  flips); finished pieces (house-0) show the same 1-LSB class, so check magnitudes, not just crawl.py's count.

## house-6 (The Lantern-maker's), critic round 2: lessons
- **A rope that "isn't there" was in shadow, not missing.** The left swags hang in the left bargeboard's
  cast shadow, and the plank `sh` tone (#463A46) equals the soot wall. Give thin dark-backed details a ramp whose
  shadow step is still lighter than the wall (`[plank hi, plank mid, plank mid]`). Ropes are now ONE closed
  `b.prism` per loop (outline polygon of the offset polyline, depth 0.065 m): no overlapping joints, no crawl.
  On a 57° gable a 0.3 m sag is less than half the 0.65 m drop between hooks, so the loops read as a band parallel
  to the board; 0.4 m makes real dips.
- **Toon point lights only lift a surface towards its OWN mid tone.** On a dark wall (iron mid #46424F) a lamp at
  0.3 m makes no visible pool. Put a light-mid surface behind the hero light (a cream gothic backboard): it warms
  clearly at night and frames the lantern by day. Kind `lamp` ranks it above the lanterns in `installLights`.
- **Fish-scale on a main roof at yaw 0** needs big scales: course 0.4, tile 0.44 along the ridge, chamfer
  [0.14, 0.12], lift 0.09, thick 0.14. Courses run along z, so at yaw 0 they are vertical lines. At 0.3 m tiles each
  scale was 4x5 px and only the camera-facing chamfer showed: a dot grid. Lift ≥ 0.07 also turned the side views'
  dashed course lines into continuous scalloped ones. On a 57° slope the lift is 1/cos(57°) ≈ 1.84x taller
  vertically, so raise the bargeboard top by that much or tiles poke over the V. Drop random per-tile tints
  (blotches at golden). Add plain verge boards on the back gable to hide the stepped tile ends and their zig-zag shadow.
- **A true hip between two tiled slopes:** clip every tile polygon (and the underlay) with Sutherland-Hodgman
  against the diagonal in the slope's (a, u) frame (`a - u·CD/len >= 0`), skip side faces on the cut edge, and lay one
  hip roll along it. Dropping whole tiles by their centre (`keep`) gives the ragged slab the critic saw.
- **Check the neighbour's whole silhouette, not just its body.** House-7's stovepipe hat and weathervane sit
  exactly over house-6's door x (39.5-40.1) up to ~3.5 m. A sign at 2.3-3.0 m was hidden; hung at 3.6-4.3 m from an
  arm rising out of the roof slope, it reads. Measure the occluder's screen box in ctx-noon before placing a cue.
- **Crawl hunting:** diff c0 against c1 shifted by the expected (sx, sy) with numpy, list the 2x2 blocks, then crop
  both frames side by side. Remaining sources here were 1-texel screen gaps: a transom bar 1.2 texels above a shelf
  (fix: a 3-texel gap), candle fronts 0.015 m behind the shelf front (fix: flush), a 1-texel hot-core proud of the
  glass (fix: 2 texels).

## house-14 (Millrace Mill), critic round 2: lessons
- **Eyebrow window that reads:** a light tucked under the eave overhang is a dark smear by day and a sliver by night.
  Lift it ONTO the roof plane: compute the front slope's top surface (`y0 + (zEdge - z)·tanS`, returned by your roof
  builder), stand the glazed light vertical at the z where that surface passes just under its sill, and build the
  hood as one solid-layer arch prism (outer + inner half-ellipse, legs dropping ~0.1 m below the roof at its front)
  running back until the roof swallows its crown. A pale plaster cheek inside the arch + sill / mullion / beam
  lintel gives a clean 6x4 px pane at the gameplay camera and a crisp glowing arch at night.
- **Thatch as planks:** the kit `thatch` pattern draws its own 0.42 m row lines that fight geometric 0.6 m courses;
  use pattern 'none' and let geometry + tints carry it: alternate course tone (1.05 / 0.93) x a gentle ridge-ward
  lightening x per-bundle jitter (0.86-1.11), plus a ragged drip edge (each bundle's lower edge 0/1/2 texels lower).
- **Steep hip ends seen at yaw 0** are near edge-on, so any course line running along z projects to a vertical
  screen stripe ("boards"). Build the hip ends as ONE smooth course; then check that nothing under them pokes out
  (side-wall timber posts topped at the eave showed as dark dots through the single plane - stop them 0.2 m lower).
- **Eave roll:** a 6-gon cylinder (r 0.12) along the drip edge of all 4 sides (`push(M({rz: PI/2}))` + `cylinder`)
  gives a fat rounded banded edge at no extra draw calls (it merges into the same soft-layer mesh).
- **Wheel spokes:** front + back spoke sets 0.2 m apart read as doubled stair-stepped lines at diagonal poses (the
  back set peeks out below the front one at the camera pitch). One front set of 6 spokes, 0.1 m (3 texels) wide,
  is clean at every 7.5 deg pose.
- **Door seams at night:** the kit doorway's interior plate glows (glowKind 2). Even a 6 mm gap between leaf and
  jamb shows as a 1-px neon line at vh 3-6. Make the leaf 16 mm WIDER than the opening and tuck it 8 mm into each
  jamb (hinge offset -0.008); it still swings open cleanly.
- **Signature extras vs the 1.2 m rule:** a tall flume / pier is "decorative" outside the footprint. Narrow the
  body (x1 2.35 -> 2.0) and run the flume inside the footprint strip instead: from a head box at the back of the
  lot down the side on trestles, turning at a corner sluice gate (hand-wheel on top) onto the wheel. It also tells
  the hydraulics story better and is visible from the iso / side cameras.
- **Night signature:** in context the wheel went black (its lantern lost the light ranking or sat too high). Add a
  low pool anchor (y 1.1, 0.75 m in front of the wheel, r 2.8, kind 'lantern') - the toon pool then picks out the
  rim, spokes and buckets.

## clocktower, critic round 2: lessons
- **Flat cream "slabs" on a stepped tower are the cornice TOPS, not the walls**: at pitch 30° every set-back
  (stage narrower than the cornice below) shows its full depth as a bright horizontal cream area beside the
  next stage. Cover each set-back with a sloped stone WEATHERING (4 mitred hexas in the wall's own ramp with
  the ashlar pattern, outer edge 2 texels inside the cornice lip, inner edge buried 4 cm into the next stage,
  bottom sunk 5 cm into the cornice so no faces are coplanar). The slopes take a lit / shaded side and joints,
  and the cornice keeps a thin cream rim. Leave a gap in the slope where an arch sill projects; on faces the
  camera sees edge-on, drop the sill and let the weathering act as the sill.
- **An open belfry seen from above is mostly FLOOR**: a timber-plank floor read as a brown crate. A floor in a
  single dark palette tone (stone sh) plus a dark timber bell frame (king post + braces in timber sh) behind the
  bell gives v1's dark niche, and the bell (receiveShadow false) pops against it.
- **Night door hall depth**: iron-sh solid boxes (stair treads, newel, a rotated handrail box) a couple of cm
  in front of the glowing glass back read as a stair silhouette against the warm glow.
- **Lanterns that read by day at 1x**: about 0.3 x 0.6 m including a 4-segment brass cap, glass in the `cream`
  ramp (toon-lit cream by day, glow at night), iron corner posts, a base pan and a 0.07 m bracket arm.
- **1/255 corner crawl on quoin courses**: the residual crawl was 2x2-texel, 1/255 changes on the cream rim pixel
  where a quoin course's top edge meets the wall. It moves with the course phase. I scanned the course start
  offset through a temporary `?qoff=` param in one remote call (5 offsets x 2 frames): 0.0047 and 0.0261 gave 0 px
  (pieces=ground,clocktower, noon), and 0.0089 / 0.0131 / 0.0173 / 0.0313 gave 4-8 px. A parameter sweep beats
  guessing. At night there is still about 20 px of 1/255 grade noise on the tower faces, and lights=0 does not change it.

## house-12 (Rookery House) - fix round lessons (dormer shards, rooks, leaded glass)
- **A small gabled dormer on a shadowed side slope reads as shards at yaw 0.** Its lit south slope is cut into pieces by the
  main slope in front of it (closer to the camera = lower on screen), and only the ridge bar and a jagged triangle
  show. Clipping each course at the valley removed the hidden interior but not the shards: the geometry was correct
  and still unreadable. A **shed (cat-slide) dormer** (shallow pitch ~0.45, top buried just inside the main-roof
  plane) reads as one clean roof rectangle plus a window face at yaw 45/90.
- **Make dormer cheeks out of the roof material.** A daub dormer body's south face rises above the main slope, sits
  in the main roof's cast shadow and renders as a flat daub-shadow grey triangle. Use one tile-hung (roof-tone)
  pentagon prism whose side faces are the cheeks, with only a thin daub plate on the window face.
- **Find a mystery shard with a marker-colour render.** Temporarily set the suspect parts' tones to #FF00FF / #00FF00 /
  #0000FF, render one town-piece shot, restore the file. This took one render; guessing took three.
- **The vboards pattern on a steep z-ridge roof** reads as a regular diagonal dash hatch at 1x. Use pattern 'none' and
  let the 2-texel course steps plus the tint patches carry the tiles.
- **Leaded lights:** one big X per pane turns into a glowing 'XX' glyph at night. Draw a clipped 45-degree lattice
  (two bar families y = yc +/- (x - cx), yc stepping by a cell of 0.2 m, lead 0.035 m, 0.018 m proud of the glass)
  in every light. A 0.135 m cell was already too dense and read as a screen-door mesh. Put the side panes on
  glow[2] (one step dimmer) so the lead survives at night. For per-face glow, split a bay's glass core into a dark
  solid core plus one thin glass box per face.
- **Rooks / birds** need a scale of about 1.35 (0.75 m bill to tail, ~22 texels) to read as birds at the gameplay
  camera. Spread them out (ridge front, mid-ridge, chimney pot, nest, oriel roof) so they never overlap the iron vane
  rook. Static birds go in the main mesh (0 extra calls); only the animated ones get their own pivot.
- **For a chimney to read upright** at pitch 30, its top must clear the roof's far silhouette in the same screen
  column: put it far back on the slope (z near the back gable) and lean it OUT against the house's shear. On the
  near half of the slope it always lies on the tiles as a flat brick band.
- **Door lantern:** hang it beside the door (not in front of it), but keep it slightly in front of the door plane
  (dot(lamp - door, doorNormal) ~0.3 m). Otherwise the point light grazes the door and the door goes night-grey.

## house-13 (Riverbend Boathouse) — fix round
- **The kit material is `flatShading: true`: lighting AND the normal pass use screen-derivative normals per TRIANGLE**, so
  patching the `normal` attribute after `b.build()` does nothing. A twisted lofted quad (up to 18 deg between its two
  triangles near a hull's bow, measured) splits into two toon bands = sawtooth facets + a crease line on the diagonal.
  Fix in geometry: make every quad PLANAR. Keep the visible edge exact (the clinker lap line, shared by neighbouring
  segments) and project the other edge onto the plane through it containing the mean cross direction
  (`m = (p1 - p0) x ((q0 - p0) + (q1 - p1))`); the projected edge is the one tucked under the next strake's lap, so its
  <= 1.5 cm steps never show. Do the outer face, the lap face and the inner face. Sawtooth gone, each strake face 1 band.
- **Tapered per-segment parameters must be evaluated per END**: `lift`/`thick` computed once from `beamAt(v0)` left a small
  step face at every segment joint where they taper (bow); those exposed end faces read as light/dark wedges. Use
  `lift(v)`/`thick(v)` at each corner's own v. (Diagnose with `debug=normal` vs `debug=raw`: wedges in raw but not in normal
  = geometry faces, not shadows; disable receiveShadow on the mesh as the second test.)
- **Overlapping strakes (u1 + 0.004 to avoid cracks) make coplanar END faces at the cut transom** -> a 1-texel z-fight
  flip under a pan. Pull odd strakes' ends back 8 mm (alternating). Crawl went 12/32 px -> only 1-LSB grade noise.
- **paintRamp() on a dark saturated hex washes out**: its hi is mid*1.3 lerped 18 % to cream, so v1 navy #284056 rendered
  as tin-grey #7e8897 and rust #9a3e2a as salmon #c9806e. For a signature paint, hand-set the 3 tones (navy
  `#3A5E8A #284466 #1C263E`, rust `#B4563A #953C2A #57343F`) -> renders #3c608d / #2c486b / #202d46 and #b45841 / #964035.
  Drop per-plank tints on big flat paint fields: they turn 3 tones into 6 near-duplicates.
- **Side door in a 45-deg corner chamfer + a hood whose gable faces the chamfer normal**: the door reads from the yaw-0
  camera (and at night the open door glows), but the hood must clear the overhang above it along the 30-deg view ray
  (`y + 0.577 * dz` must stay below the eave at the overhang's front). I raised the hull gunwale 2.5 -> 2.8 m for that.
- **Head-on identity for a gable-end-to-camera object**: painted lettering beats geometry. A 3x5 pixel font with 1 font px
  = 2 gameplay texels (letters 0.2 x 0.33 m), one box per horizontal run of lit pixels (~60 boxes), cream on the dark
  boards, reads 'RIVERBEND' at 640x360. Avoid a 3-wide 'N' with a diagonal (reads as H): use the lowercase-n arch.
  Plus a caulked dark rim round the transom and a rudder on the stern post: the stern stopped reading as a barn gable.
- Decorative extras outside the footprint are capped at 1.2 m, so the shop sign moved onto a 1.0 m mooring post (+ lantern)
  on the SE apron, face to the camera; it marks the door corner from the south and lights it at night.

## house-8 (Hearthstone Cabin) - critic-fix pass lessons
- **A roof whose ridge runs along z is seen gable-on at yaw 0, so its courses run vertically on screen.** The kit
  `shingle` pattern on it read as board-and-batten. Explicit shakes fixed that: 11 stepped courses per slope, each
  split into staggered 0.55-0.75 m shakes with a 0.075 m gap (z shows at 0.5 scale on screen, so 0.075 m is about
  1 px) over a dark underlayer slab. Shorter shakes (0.32 m) made a busy cream-dash basket weave. With no gap,
  tone-only joints vanished in the toon bands and the strips came back.
- **Moss belongs inside the shake mesh.** Whole shakes painted with the moss ramp `[mid, mid, sh]` inside
  hand-placed elliptical blobs (plus 0.35 noise) read as grown-in moss and stay darker than the lawn. The old soft
  boxes on the roof each carried their own outline and read as pasted stickers.
- **Gable verge crawl came from the sawtooth of course ends, not from the boards.** Each stepped course's end face
  made 1-texel diagonal steps that flipped on a 3,2 pan (7-12 texels). Nudging the board or making it shadowless
  changed nothing. A barge board IN FRONT of the shake ends (0.03 m proud, tall enough to cover them) gives one
  straight rake edge: 0 crawl px on house-8. It also reads as a thick roof edge.
- **Side door at yaw 0: let the leaf swing OUTWARD.** Hinge it on the far (north) jamb at the outer face (wrap
  kit `door()`: `pivot.rotation.y = -f * 1.55`). Open, it stands across the step with its face toward the camera,
  a big oxblood rectangle you can't miss. Life's driver extrapolates whatever rotation axis open() uses, so
  overshoot still works. Anything overhead (porch, braces) has to clear the leaf's top over its whole swing.
- **A porch has to show a GABLE to the camera.** A south-facing pent or a ridge-along-x porch reads as a brown
  box from yaw 0. A ridge-along-z porch puts a cream-barged triangle on the plane the camera sees, at 0.8 m wide.
- **Night light pools without PointLights, switched per state:** glass-layer quads in the main glass mesh. Record
  their vertex range while building (`b._layer('glass').pos.length / 3`), collapse them to one point when inactive
  (rewrite `position`), and rewrite their `aGlow` rgb to brighten the step skin when the door opens. Re-key this
  in `update()` from `nightGlow(engine)` and the lit state. No new mesh and no new program: 6 calls in total.
- **Firewood: short rounds lying ACROSS the pile (along x), with an end disc of about 0.64 x the round's radius**,
  give the honeycomb woodpile face. The wall-log end-disc helper used the wall log's radius (0.14 m) on 0.07 m
  rounds, which merged into one pale slab.

## house-10 (The Old Boot), critic round 2: lessons
- **A tall piece's noon shadow can erase its own signature surface.** The "instep is a flat dark slab" was not the
  loft's shape: the 6 m shaft's cast shadow (sun relAz 150, elev 50 throws it right and back) covered the foot top.
  Moving the foot loft and its laces into a second Builder built with `receiveShadow: false` (+1 call; the program
  variant already exists in town) gave the vamp top the hi band at once (checked with `debug=raw`). Ask "self-shade or
  cast shadow?" before reshaping geometry.
- **A cuff/collar reads when it is a RING with the roof set inside it**: a flared octagonal ring (wider at the bottom,
  so its faces tilt up into the light), a lit top rim, the cap's eave 0.06 m below the ring top and inside its wall.
  A square hip roof over an octagon covers the diagonal facets with its corners; use an octagonal pyramid (stepped
  courses on 6 facets, plain slabs on E/W, a hip rib on each hip to hide the course ends).
- **Detail on a self-shaded facet goes grey.** Cream laces on the SE facet (away from the sun) rendered as a
  grey ladder. Put signature trim on a lit surface: here the laces moved onto the instep top (3 crosses of 0.09 m
  laces, 0.1 m eyelets, a bow with loops tilted 0.55 rad), and the SE facet kept only a dark tongue with brass eyelets.
- **Own leather ramp**: paintRamp('#5a3c2c', {lightness: .36 / .29}) reads as brown leather; a saturated input
  (#763a26 / #6a3a28) through paintRamp (sat x1.1 + .06) still came out as terracotta. Desaturate the INPUT hex.
- **Inward door on a solid organic body**: no hole needed. A deep timber reveal ring (0.26 m proud) + a glass
  interior plate 0.06 m proud of the wall + a leaf in front of it rotating toward -z: the leaf slides behind the plate
  and the doorway glows. A rectangular leaf under a fixed glazed fanlight keeps the door readable at night.
- **Crawl hunting by texel**: print the differing pixels (x, y, |d|, colour) at the expected shift instead of reading
  the magenta strip. The 35/255 texel was a hip-rib tie (rib half-width 0.05 -> 0.057 fixed it); two 1/255 texels at
  kit window sills disappeared after nudging the windows 4-6 mm. Noon crawl with `pieces=house-10` is now bit-exact
  (0 px); golden still shows <= 2/255 grade-level noise at the toe.

## dais - revision after the art-director pass (20/24)
- **Foreshortening makes "sword" shapes.** At the 30 deg camera, a ground ray along z gets shorter on screen but keeps
  its full width, so it reads as a fat blade, while rays along x read as thin lines. A long N/S compass pair plus a
  thin lectern stem on the screen-vertical axis read as a sword, and later as a dagger. The fix was long points on the
  diagonals (an X star), short points on the cardinals, N as a short brass diamond, and a squat desk-width lectern
  (stone plinth slab, carved body with a dark timber panel, slanted rest) instead of a column.
- **Toon point-light pools take the light's hue times each surface's mid tone.** A `fireGlow` (#FF9A4A) light over grey
  setts gave a muddy brown-red disc. Using lamp-yellow `glow[1]` and r 2.6 from 1.2 m up (platform at full band, treads
  one band, setts none) fixed it. When you need more pools than the 12-light budget allows, fake them as emissive
  decals in the pool's own colour, `mid * mix(1, light / max(light), 0.6)` (what toon.js does), with 2 bands (full and
  x0.66). The candle-lit seat tops at night use this and read as warm-lit stone, not stickers.
- **Light on a block ring belongs on the blocks.** A rotating flat wedge read as a UI overlay. Use one decal per dressed
  block, inset 1 texel from the joints, with one slot each. Light the block(s) under the hand tip (at a seat pose,
  both blocks around the stone) in `dial hi -> glow[1]` 0.88, and the block behind it at 0.4. Joints stay dark, so it
  reads as lit stone.
- **Two hands on one pivot must never coincide.** BotC voting starts at the seat clockwise of the nominee, so the
  long hand starts there. The short hand parks at 10 or 2 o'clock whenever the long one is within 0.75 seat of it
  (vote end, execution). At night, a faint gilt spine (brass hi x 0.5, emissive, rotating with its hand through a
  second uniform) keeps the dial readable.
- **Dead does not mean black.** Recolour a dead stone to a lighter cool ramp (`stone`, plus 28 % toward `slate` while
  its ghost vote is unspent), keep the boss as pewter, and show a crack and moss fleck from the states mesh (vertex
  range collapsed when alive). Leave the darkest value to the outline.
- **State signals need 5+ texels at vh 12.** The pennant is 0.24 x 0.32 m on an arm on the camera side, flying away
  from its stone, which hid it before. The wisp is 0.22 m wide and 0.62 m tall with a white heart and a cool pool on
  the stake foot. The candle is 0.1 m and its flame 0.12 x 0.24 m.
- **Crawl residue of 1/255 on a whole-texel pan** came from a tapered (frustum) 8-gon hub's side face. A straight
  cylinder fixed it, and dais+ground then gave 0 px at noon, night and in the demo vote state. Lift emissive decals
  >= 1 texel (0.036 m) above the surface they light.

## foliage, fix round 1 (spring pass)

- **Spring is decided by the ramp, not the shape.** Swapping the broadleaf rim from the pine ramp + `#1C3536` core to the leaf
  ramp (plus ~25 % young trees on the mossTuft ramp) made the wood read as spring at every camera, with no geometry change. Keep
  the pine ramp only for actual pines, and give pine tips `mossTuft` hi (`#B4C474`) so the canopy tops show new growth.
- **Blossom needs two layers.** A `tip` = flowerWhite / pink palette alone only colours the few raised, sun-facing clumps, which
  reads as a faint frost. Add 5-8 % of the tree's leaves as `blossoms` star sprites (white or pink, yellow / white eye) on the
  camera-facing shell. Pick that shell with the world normal after the stamp's quarter turn, and skip leaves culled inside a
  neighbour. Also set `raiseThreshold` to 0.45 for more tip clumps. Pink = flowerRed lerped 55 % toward flowerWhite.
- **Tiered pines from createTree parts:** use a leafless pine trunk (`maxLeaves: 1`), 3-5 `bush` lumps squashed to `sy` 0.52 that
  narrow upward, and a small pine on top as a spire. Transform normals by the inverse-transpose `(nx, ny/sy, nz)`. Each skirt
  then has a lit top and a core-dark underside band, and trunk glimpses show between tiers. They read as pines at 640x360 where
  stock 'pine' cones did not. Recompute the wind sway (`aVar.z`) from the composite height, or the tiers sway as separate bushes.
- **Composite cores cost triangles, mostly off-view.** Without care, 6-lump templates pushed foliage from about 300k to about
  500k triangles. Most of that came from the off-view decimated cores, which are about 500 trees. Three changes cut it:
  - vertex-cluster the composite core at 0.19 m;
  - use off-view `coreLo` cells of 0.85 m for tier pines and 0.7 m for rounds;
  - drop the trunks of trees more than 10 m outside the view.
  Result: 190-305k triangles at gameplay, overview and iso, 367k on the yaw-180 pad. Add a `?ftpl=1` stat (per-template core
  triangles, coreLo triangles and use count) before guessing where the triangles are.
- **`pick()` by nearest height always took variant 0,** because variants share h. Break ties with the rng.
- **Template build time is dominated by createTree's Poisson leaf darts,** about 20 ms per round tree. 30 templates take about
  550 ms. Reuse templates (for example, the blossom slots reuse the rim blossom templates, scaled) rather than adding more.
- **Ground flower decals need 3x3 blossoms** to read at the gameplay camera. 2x2 sprinkles read as noise. Each decal is now 3-6
  `patchA` / `patchB` sprites clustered over about 1 m. 2-texel ivy leaves (`ivyBig`) are visible on a trunk where 1-texel ones
  were not.
- **Judging the south belt:** in full-town shots it sits under drifting cloud shadow and house-9's shadow, so it looks darker than
  it is. Judge crown separation on `pieces=ground,foliage&clouds=0` too (`shots/town-foliage/r4/s0.png`).

## props - critic-fix round lessons
- **A near-flat slab shows one toon band, so it reads as a painted billboard.** The awning was a single 0.26 m-drop
  plane, so every stripe was a single tone. The fix was 3 facets per stripe on a bellied profile
  (`AWN` = (-0.48, 2.26) -> (0.3, 2.215) -> (0.84, 2.11) -> (1.16, 1.975)). Each facet gets a `tint` step
  (1.05 / 0.95 / 0.85), and the valance and scallops get a darker one (0.82 / 0.78). Add a 0.048 m cream
  piping strip on the ridge. Result: light at the ridge, mid body, dark valance, and the max height is unchanged.
- **Wares under an awning go muddy in its cast shadow.** Build them in their own Builder with
  `build({receiveShadow: false})`. It costs +1-2 calls, the wares still cast shadows, and they keep their lit tones.
  Do the same for small hanging things (garlic, lanterns). Also bring the wares to the counter lip, make them
  ≥ 3 texels, and use a 3-tone accent ramp (CHEESE / RIND / CURD / LOAF) rather than single hex tones.
- **Warm lamp pools that the toon point light can't give.** The reach is capped at `uPointShape.y` = 4 m (night),
  the mix is towards the authored mid at most 1/3, and over teal grass it reads as olive.
  - Use one flat disc per lamp in a ShaderMaterial on `LAYERS.COLOR_ONLY`: depthWrite off, 3 hard world-space
    rings (crawl-free).
  - The scene RT holds display-space colour, so a pure additive blend also turns olive. Blend as
    `out = warm*k + dst*(1 - keep*k)`: `blendSrc One`, `blendDst SrcAlpha`, with the fragment alpha
    `1 - keep*k` and the alpha channel kept (`Zero/One`).
  - Drive k from the lamp's composer PointLight intensity, read in `mesh.onBeforeRender`. That runs after every
    update of the frame, so the composer's flicker and life's lamplighter / dusk wrapper drive the pools.
  - The disc winding must be CCW seen from above, or FrontSide culls the whole thing silently (no error, nothing
    drawn).
- **Fountain water goes black at night** because the water pass scales the body, wave and sparkle colours by
  sky luminance (`uLight`). At `tod=night`, wrap `water.pass.update` and clamp `uLight` from below
  ((0.42, 0.5, 0.62) gives about #375470). Brighten `uSparkCol` above 1 and raise `uSparkRate` (0.09) for moon
  glints. No extra pass or mesh.
- **Falling water**: give each arc segment a radial extent of its whole step (`rb - ra + 0.05`), so the body is
  continuous. Animate only a lighter head segment walking down it, plus a stepped splash (2 low <-> 3 tall foam
  pixels and a hop droplet). Gaps in the body read as dotted lines.
- **Placing new props**: from the 30° camera, check what stands in FRONT (larger z) of a candidate tile. A 2.2 m
  noticeboard at z 23 vanished behind the lower-ring tower roof (houses at z 27+ hide z ≥ 23). A well at z 11-12
  sat in the red stall's 1.73·h sight shadow. The props file exports `PROPOSED`, and `?propsExtra=1` previews it.

## ground, critic round 2: lessons
- **Spline your polylines before building distance fields.** A river given as ~7 m control segments shows every kink
  in the banks, the shallow band and the foam line. A uniform Catmull-Rom resample at 1 m (2 m for the road; keep the
  dead-straight in-town stretch linear) plus a second, very low-frequency width noise (0.035 /m) makes it meander.
  With 70-230 segments, precompute per-segment data and skip a segment when its bbox is farther than the best hit so far;
  the bake stayed at ~0.5 s.
- **Water per time of day goes through createWater opts, chosen at build from ctx.tod.** Night: `skyColor` (a moonlit
  #3C5478, not the near-black sky), a fixed `light: 0.26`, reflect 0.4 and foam 0.6 make the river read as slate-blue
  water with a shore line rather than vanishing into the forest tone. Golden: the warm sky milks the river out. Use a
  fixed `light` (~0.74), skyReflect 0.1, high opacity [0.72, 0.88, 0.97], depthMax 0.5 and teal body colours.
- **Far-LOD lane setts:** don't fade to a flat tone. Grow the voronoi cell to keep >= 5 px (`max(cell, 5 / pxPerMetre)`),
  keep the joints, the cream sun rim and a third darker mottle tone, and widen the earth verge to >= ~2 px. At overview
  the lanes then still read as cobbles, not asphalt.
- **One lighting language for all setts:** lanes get the same upper-left cream rim (ashlar hi) the plaza setts have,
  with a weaker (kerb-tone) rim for the 0.3-0.55 band of sun alignment.
- **Kerb gaps:** place the end of each kerb run from the BAKED field (the wobbled edge the shader paints), not from the
  analytic lane distance. Subdivide each failing block into 8 parts, keep the ok parts adjacent to the run as one
  shorter, slightly taller and lighter "dressed end stone", and flare the lane 0.3 m into the kerb band in the shader
  (smoothstep back to 0 by r1 + 0.6). The setts then run right up to the end stone, with no bare wedge.
- **Crawl triage:** render the same pan with `water=0`. The remaining 8-16 px near the bridge and river were the water
  post pass refracting 1/255 differences. With water off they are 1/255 grade noise. An anti-tie sweep of the deck
  planks (4 offsets) took the bridge from 32 px to 16 px.

## life, critic round 2: lessons
- **Smoke at a 30 deg pitch:** a puff's drift in +-z moves it on screen by sin30, but its rise moves it by cos30. If
  drift is larger than about 1/3 of the rise, the column lies on the ground and reads as a scratch across the plaza.
  Cap drift at 0.6 m (and let it grow as u^2, so only the top bends) against a rise of about 1.85 m over 2.6 s. Use
  5-6 puffs of 6-11 texels. Draw the youngest puff first and the oldest last, so each older puff overlaps the one
  below it and its lower-right rim stays visible.
- **Dissolve by shrinking, not by a sparse field:** step the radius in (x0.58 at the end) and let only the outer
  1-texel ring break up on the Bayer pattern. A whole-disc Bayer threshold makes a cream checkerboard on the setts.
- **Night particles must not be toon-tinted:** at night the ramp tints multiply a puff darker than the lit
  cobbles, so it becomes a slab. Draw night smoke emissive in the slate ramp (slate hi core, slate mid rim). It then
  sits one clear step lighter than the setts (~#4D5B77).
- **Sprite crawl fix:** snap each sprite centre in JS with `camera.snapWorld(p + rootOffset)`, and keep local = the
  snapped point, so the world position is grid + ANTI_TIE. The grid lands on texel CORNERS (640 is even, so the
  frustum centre is a corner). In the shader, use `floor(px + 0.5)`, then add +0.5 for odd sizes. It never ties,
  and life on/off crawl counts are now identical (day / night / ceremony).
- **Inward doors are invisible:** the kit doorway's interior plate is only 0.22 m behind the hinge, so a 1 m leaf
  is behind it after about 13 deg. Swing outward instead (f < 0, extrapolated from the owner's open(0)/open(1) for
  EVERY object whose rotation changes, which also covers the tower's double leaves). Settle at f -0.74 (about 70 deg):
  the planks face the camera, and the side doors on the edge-on east and west walls show a leaf too.
- **Walking in:** the target must be 0.95 m behind the door point, past the plate. The plate then cuts the body
  over 2-3 stepped frames, and hiding it afterwards is invisible. At 0.4 m the body stood in front of the plate and
  popped.
- **Crow flight at yaw +-90:** with a side-on dihedral, the near wing projects onto the body and the far wing
  stands up as a column (the '+'). Bank flying crows to the nearest diagonal (yaw +-45 / +-135). Keep every wing pose
  above level (tip +0.08 .. +0.3) and the wings 2 texels thick.
- **Instanced figures on rotated yaws:** their CAST shadows added 12 crawl px on a whole-texel pan. Extra sub-texel
  nudges and 45-degree stops both made it worse. The folk now receive shadows but do not cast them. A Character
  standing on a 0.2 m stone added 4 px; sinking its feet 1.1 cm into the stone made it 0. Sweep these with A/B params
  (`?folkShadow=`, `?seatDy=`) in one loop; don't reason about them.
- **Deforming another piece's merged mesh (banner flutter):** moved vertices need their own fixed sub-texel
  phase. (0.0071, 0, 0.0043) gave 0 px in all 3 drawings; (0.0031, 0, 0.0017) left one 1-texel tie in drawing 0.
- **Re-dressing a character spec:** a palette override misses parts that bake a literal tone array (the hound's
  MOSS_RIM). Map `spec.parts` as well and replace those arrays.
- **zsh gotcha:** `"$p[01].png"` is an array subscript in zsh. Use `"${p}[01].png"` for crawl.py globs.

## house-4 (Mossbank Cottage) - critic round 3 (overview melt, rotated sprite sort)
- **A turf roof needs a non-green lower edge to read at overview** (vh 32, ~0.09 m/texel): a 0.16 m dark-peat soil
  band (#76604F/#56443F/#3A3240) under the turf edge plus a course of pale rounded stones (flattened 8x4 spheres,
  rx 0.135-0.165, ry 0.09-0.115, centred one ry below the soil band, inset 0.03 m) gives a crisp light rim with its
  own 1-texel outline underneath; skip the stones where the v1 eave log already runs. Stones placed less than one
  radius below the soil disappear into the soffit and read as a dotted dash line (first try).
- Lifting the drystone wall ramp one step (hi #C8C0C6, mid #A59CA8, sh #686476) is enough to separate the walls from
  the shaded ground at overview without losing the rubble pattern.
- **Self-sorted merged sprite meshes must sort in the mesh's local frame** once the composer rotates the piece:
  transform the camera forward by inverse(mesh.matrixWorld) and include matrixWorld in the re-sort key.
- **Give sprite meshes a truthful local boundingBox.** Box3.setFromObject on an InstancedBufferGeometry uses the
  template's extent; the turntable auto-fit saw y -6..12 and framed a 22 m view. Set geometry.boundingBox/Sphere.

## house-11 (Fernlea Oak), critic round 3: making the tree dominate
- **"A cabin on a stump" was a proportion problem.** The fix was: a taller bole (top ring 3.25 m, tapering 1.34 -> 1.12 m
  where the boughs leave), a smaller cabin (2.1 -> 1.7 m wide, ridge 5.72 -> 5.5), and a crown 6.5 m wide that
  wraps the cabin. A crown only behind the cabin reads as a backdrop. Small clumps over the deck ends and eaves
  (x +-1.2..1.4, outside the cabin walls) give "the gable peeks out of the leaves" and keep the window and rail.
- **A controllable crown = many 'bush' clumps** (createTree kind 'bush', `at` = clump base, ball centre +0.55 R)
  merged house-4 style (truncate `_treeSorters`, concat leaf instances with an aBase offset, merge the cores). That's
  2 draw calls for 13 clumps. Budget: icosphere cores cost ~320 tris per blob (bush = 2-4 blobs), so keep cores only on
  the big masses (6 of 13) and use `leafTexels: 4.2`. That brings ctx tris from 20.7k to 14.9k (piece budget 15k),
  and the crown still reads full. Isolated turntables count more (the closer camera gives denser leaves).
- **Boughs hidden under a crown**: their elbows must come forward (+z 0.35..0.5) and sit below the clump bottoms
  (~2.5 m), or the leaves' view push hides them completely. Octagonal parallel-transport tubes with the bark
  `vboards` pattern match the trunk loft.
- A lantern hung under a bough inside a clump vanishes: hang it lower and forward of the bough (z +0.3) and shorten its
  reach (1.8), or it paints a disc on the crown. The props streetlight at (3.5, 33.5), r 5.5, also lights the crown's
  front-left clumps at night (a soft yellow-green patch).

## house-12 (Rookery House) - r6 overview-merge fix
- Two neighbouring roofs in the same hue family merge into one building at the overview (vh 32, ~11 px/m) even when
  the gameplay views separate them. What separated Rookery from house-13's rust hull: a VALUE + hue shift of the tile
  ramp (lighter, browner `#C88A64/#985C45/#523A47` vs the hull's `#b45841` lit), plus a ridge break (the rear range
  0.36 m taller: a bargeboarded step whose dark barge line crosses the slope), and a darker sooty-brick chimney (the
  shared `brick` ramp is nearly identical to `red`, so the chimney vanished into the tiles).
- A ridge break that is TALLER behind is easy: same pitch, y0 + DY, a daub chevron at the step (only the band above
  the front tiles shows; the rest is hidden by the front roof shell), knee walls + a raised plate under the rear eaves.
  A LOWER rear range would make the wall corners poke through the roof.
- Moss as one box per patch reads as rectangular stickers; 6-10 small cushions scattered in an ellipse (dark `moss`
  base, one or two `mossTuft` tops, soft layer) read as a ragged mass. Clamp cushions to their own range so none float
  over the step.
- The focus cut-away box is footprint + 0.35 m: anything proud of that on the camera side (an oriel's glass + lead
  lattice at z +0.38 from a footprint-edge wall) is discarded in gameplay focus views and shows the dark core behind.
  Keep camera-side projections inside footprint + 0.35 (OD 0.38 -> 0.30, RZF -0.05).

## house-6 (The Lantern-maker's), critic round 3: the side door that reads
- **A side door at yaw 0: turn the DOOR, not the wall.** The camera sees an east or west wall exactly edge-on, so a
  hood over the west door (even an open porch) still shows the leaf edge-on. Instead, build a closed entry vestibule
  that projects about 1 m off the side wall, put the door in its SOUTH face, and set that face back far enough to
  keep the doorstep on the game's door tile. House-6's porch spans z 23.4..24.45 and the door tile is 39,24. The
  porch is a mini copy of the house front: 50° fish-scale hood, cream bargeboard V, a finial, a glowing diamond in
  the gable and a swag of 3 lanterns along the gable foot. Publish the real door through the door anchor's
  `point`/`normal: [0, 1]`.
- **Hood pitch vs the main eave:** the porch ridge has to stay under the main roof's overhang. Check the hood
  surface at the eave-overhang x (house-6: 2.85 m, under the main eave at 3.16). A 57° hood would have clashed.
- **A pool light at chest height in front of a door paints a hard toon disc on the leaf.** Hang it at the lantern
  swag instead (2.3 m, 0.25 m out, r 2.6). The door then only grazes the light and the step and ground get the pool.
- **Ablate before you blame a light:** a temporary `?h6drop=i,j` filter on my light anchors showed that the red disc
  on house-7's cap at night stays when every house-6 light is gone. In the house-7 focus view it sits right over
  house-7's own east window light (40.45, 2.05, 31.45, r 1.6). I still shortened house-6's lamp from 4.3 to 2.3,
  dropped the light from the tin sign and from the west canopy lantern, and kept the porch light at most 2.6 m out.
- An edge-on window sill (0.16 m deep) on a side wall shows as a floating cream block at yaw 0: use `sill: false`.

## house-10 (The Old Boot), round 3: "silo" -> boot
- **The silhouette words come from the profile edges, not the plan.** An octagonal shaft + pyramid cap read as a silo
  however good the trim. What fixed it: (1) a superellipse shaft (plan exponent 4: a broad flat south face, rounded
  corners) lofted through rings whose BACK edge moves (heel-counter bulge 11.02, ankle waist 11.3, flared collar
  11.12), (2) the collar cut on a slant (0.13 m/m, higher at the heel), (3) a rolled turned-down tan cuff loft (tucked
  lip, flared bottom, roll, lit top rim, dark lining) with the moss lid INSIDE it (4 stepped rings, 0.55 m rise: a lid,
  not a spire), (4) a pull-loop on the back of the collar, (5) a 0.25 m dark sole + 0.05 m tan welt lofted along x
  from the union of the shaft-bottom and foot plans, a stacked heel (2 lifts + brass nails), an arch gap and the sole
  sweeping up under the toe (yb(x) drives the upper's bottom, the sole and the heel together).
- **Laces belong where the face is flat and lit**: the true "front" of a shaft is edge-on at yaw 0 and curves away on
  a rounded plan. Put the tongue + eyelets + criss-cross cords on the south face's right half (|dx| < 0.6 ax), seated in
  a frame on the tangent plane (`shaftSouth(x, y)` -> {z, ry}); 0.075 m cords and 0.1 m eyelets read at vh 12.
- Toe cap seam for free: make the cap sections slightly larger than the vamp (top +0.05, north -0.04) and keep the
  chamfer plane unchanged for the door: the step gets an outline + a colour change; 5 cream 1-texel stitches on top.
- Small soft-layer moss boxes on a rim read as green bricks at vh 6-12: leave them out.
- 4.4k tris / 5 calls; crawl (towncrawl --pieces house-10, noon, pan 3,2) 0 px over threshold.
