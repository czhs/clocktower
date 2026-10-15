<!-- Authored by gpt-6-astra (codex exec, 2026-10-14, prompt: packages/assets/ai/prompts/review-01.md,
     inputs: real-client screenshots) and curated by the assets/art lead. Keep it current. -->
# Clocktower Town — Hollowmere art direction

> **Since the 2026-10 visual overhaul, all art is authored at 2× density** (32 texels per 16-px world tile, characters 48×64 texels, drawn at scale 0.5 in world units) — see the last section. Sizes quoted below in native pixels refer to the original 1× contract; double them for authoring.

This is the production contract for new and remastered art. All designs, symbols, silhouettes, and decorative motifs must be original; do not imitate another game's assets, logos, or role tokens. Preserve existing asset interfaces unless an explicit renderer change accompanies the delivery. All measurements below are native world pixels unless marked **CSS px**.

## Mood

Hollowmere is a damp, inhabited village whose familiar routines become uneasy after the bell: repaired slate, old plum-grey masonry, soot-dark timber, herb gardens, and warm rooms behind small windows. The gothic character comes from tall narrow proportions, ironwork, clock mechanisms, and long evening shadows. Keep domestic warmth and traces of ordinary work visible alongside the churchyard and looming tower. Day is quiet, cool, and readable; night is blue and secretive, with restrained amber pools that help people find one another. Avoid both cheerful candy colours and uniform brown-black gloom.

## Master palette

These are **authored base colours**, not colours sampled from the current lighting overlay. Ramps run dark → light. Reuse swatches across materials; do not add near-duplicates without updating this table. Lighting may create intermediate display colours. Limit an individual ordinary prop to 8 colours and a character to 12, excluding transparency and separately rendered light.

| Material / use | Named hex swatches |
| --- | --- |
| Shared contour / iron | Soot `#191C29` · Iron `#333646` · Worn iron `#626979` |
| Stone / cobbles | Mortar `#353442` · Plum stone `#505061` · Weathered stone `#747383` · Chalk edge `#A39DAB` |
| Slate roofs | Slate shadow `#252C41` · Deep slate `#394764` · Rain slate `#596D89` · Slate edge `#889BAE` |
| Red roofs / brick | Fired shadow `#402832` · Oxide `#713E3D` · Clay `#A65F4B` · Tile edge `#C98967` |
| Thatch | Straw shadow `#493C2D` · Old straw `#77603B` · Cut straw `#AE8C4E` · Straw tip `#D1B879` |
| Timber | Charred wood `#30282C` · Heartwood `#594034` · Oak `#876044` · Worn wood `#B18C62` |
| Plaster / linen | Old plaster `#8B8277` · Limewash `#BDB3A0` · Linen `#DED2B7` |
| Earth / dirt paths | Wet earth `#3B3330` · Trodden earth `#66503D` · Dry earth `#937354` |
| Foliage | Pine shade `#243A34` · Moss `#3F5540` · Leaf `#64774B` · Leaf tip `#91A46A` |
| Water | Deep pool `#1F3046` · River `#304F6B` · Ripple `#577B93` · Foam `#A6C5CA` |
| Skin, deep ramp | Deep skin shade `#4B3035` · Deep skin `#805047` · Deep skin light `#B57D60` |
| Skin, medium ramp | Medium skin shade `#75463D` · Medium skin `#B67D59` · Medium skin light `#DDA677` |
| Skin, light ramp | Light skin shade `#A06B58` · Light skin `#D8A17E` · Light skin highlight `#F0C8A0` |
| Cloth, plum | Plum shade `#30243F` · Plum `#574064` · Plum fold `#806184` |
| Cloth, wine | Wine shade `#492C3B` · Wine `#814953` · Wine fold `#B37072` |
| Cloth, teal | Teal shade `#243F44` · Teal `#41676A` · Teal fold `#729395` |
| Cloth, ochre / brass | Ochre shade `#665032` · Old brass `#A38348` · Brass edge `#D5B56A` |
| Ghost | Ghost contour `#526E83` · Mist `#8EB4C2` · Spirit light `#CCE1DE` |
| Light | Night blue `#243452` · Ember `#D98043` · Lamplight `#F0B85F` · Flame core `#FFE2A0` |
| UI | Panel ink `#211F2C` · Frame iron `#454250` · Muted text `#B7B0BE` · Parchment `#E4D8BA` · Ink text `#302C36` · Focus gold `#D5B56A` |

Keep full Chalk edge out of ordinary cobble interiors; it is for occasional edges. Use muted skin shadows, not a grey night wash baked into faces. Warm cloth and brass are accents, not field colours. Reuse stone, iron, and timber shadows for dark cloth where appropriate.

## Pixel construction, shading, and outlines

- Tiles are **16×16**. Draw all world sprites on the same native pixel grid; a larger building has more pixels, not larger painted pixels. Export transparent PNGs without resampling or antialiasing. Use integer camera/render positions and nearest-neighbour **2×, 3×, or 4×** world scaling.
- A quiet ground tile uses at most **4 colours, 3 texture clusters, and 2 isolated accent pixels**; a cluster is a connected shape, not scattered noise. A structural tile uses at most 6 colours and one primary pattern, such as cobbles or planks. Tiny fixtures such as lanterns can use 8 colours. Do not outline every grain, brick, leaf, or roof tile.
- Use **3 value steps per material**: shadow, body, highlight. A fourth is allowed for large architectural planes, polished metal, or emissive cores. Shift cool shadows toward blue/plum and warm highlights toward ochre; do not merely lighten/desaturate the same hue.
- No gradients, airbrushed shading, random noise, checkerboard dithering, or baked blur in sprite pixels. Texture comes from deliberate clusters. Smooth runtime light falloff is the sole world-effect exception; it must not blur sprite edges.
- Outer contours are normally **1 px Soot** or the material's darkest swatch. Keep them strongest under eaves, on lower/right edges, and around characters against bright ground. Break or lighten outlines along lit upper/left edges. Use material shadows for interior seams; no continuous pure-black boxes around every object.
- Pixel UI ornaments and icons also use a native integer grid. HTML text remains screen-resolution text; do not rasterize body copy into the world canvas. This is a separate UI layer, not permission to mix pixel densities within world art.

## Perspective, light, and depth

Use orthographic 3/4 top-down projection: map axes are screen-horizontal/vertical, vertical objects rise up-screen, and tops are visible. Ground circles remain map-plane circles; raised round tabletops are ellipses approximately 2:1 in width to depth. No isometric diamonds, vanishing points, or front-only furniture. Match door widths to 1–2 tiles and benches to the existing villager scale. Maintain roof pitch and eave depth within each building family; extensions may alter silhouette without altering pixel scale.

Daylight comes from **screen upper-left**. Cast ground shadows toward **lower-right**, initially `(4, 6)` px for a small prop and `(8, 12)` px for a tree/building section. Keep tall-landmark shadows stylized so they do not blanket the square. Use a separate Soot shadow mask at roughly 25% opacity. Draw 1–2 px contact/AO bands under feet, wall bases, furniture, and eaves; never a fuzzy halo around all sides. AO stays tight and neutral-cool. Nearby lamps can add warm facing edges without reversing the whole baked daylight ramp.

Give actors a common foot anchor and props a ground footprint. Sort trunks, furniture, walls, and actors by ground contact, not image top. Split tall assets into opaque base and upper occluder where needed. A cutaway must reveal a clean actor silhouette; avoid multiple translucent architectural layers over faces. Mark collision footprints separately from decorative overhangs.

## Day and night

Author neutral day assets once. Keep day shadows cool, walls readable, and most window interiors subdued; do not burn every window at full night brightness all day. Store window/flame emission separately from wall texture.

For an initial night tuning pass, apply Night blue with a normal source-over blend at **40% opacity** over the world; test within **35–55%**, rather than stacking an additional heavy black multiplier. These are proposed starting settings, not a description of the current renderer. Preserve at least three distinguishable masses at night: path, grass, architecture. A villager on unlit cobbles must still be identifiable by silhouette and accent at 2×.

Use warm lamps with a strong core and a restrained **2–3 tile** falloff; windows spill approximately **1 tile** onto adjoining walls/ground, lanterns **1–1.5 tiles**. Block spill through opaque walls. Reduce day cast-shadow strength at night, preserve contact AO, and keep ambient blue in unlit areas. Composite UI and name labels after world lighting. Test the churchyard, garden gate, bridge, and square under the same settings; do not solve one location by making another illegible.

## Characters and labels

- Frames are **24×32**, **5 columns × 4 direction rows**, giving a **120×128** sheet without padding. Preserve the existing engine's direction-row and frame order; document that order with the asset. Preview-sheet backgrounds are not exported into sprite transparency.
- Put the ground anchor at `(12, 30)`; align soles around row 29. If current sheets use another anchor, migrate all affected sheets and renderer metadata together. Keep body/props inside the cell with 1 px side clearance. Walking bob is at most 1 px; do not let the baseline drift.
- Each villager gets one silhouette feature, one cloth accent, and a face/hair value break. Keep readable cues in front, back, and side views. A hat, apron, scarf, or satchel must stay recognizable without a label. Avoid giving everyone the same broad-brim hat or brown coat. Clothing is cosmetic and must never disclose secret game alignment or role.
- Use large cloth planes and small facial marks. Limit face detail to essential eye/nose/hair clusters; no tiny rendered mouths on every frame. Keep the head boundary readable for every skin ramp, including in night shade.
- Labels use 14–16 **CSS px**, pale text on a compact near-opaque ink backing, and remain the same screen size as world zoom changes. Place them 6 CSS px above the silhouette; resolve collisions with at least 4 CSS px separation. Prioritize local/selected/speaking/hovered labels when crowded, preserve roster access, and offer an always-show mode. Ellipsize long names, revealing the full name on focus/hover. Never colour-code identity alone.

## Ghosts and the Storyteller

Ghosts retain hair/headwear shape and one costume feature from their living form. Repaint with the three ghost swatches; do not automatically bleach every pixel. Use a darker contour against cobbles, a mist body, sparse Spirit light accents, and a broken tapering hem instead of solid shoes. Start body opacity around **85%** and adjust for legibility; use a small hovering bob without changing the logical foot anchor. Remove the solid living contact shadow. No large glow halo. Death state and ghost-vote availability are separate UI states.

The Storyteller owns the broad plum hood, recessed face, small warm eyes, and a hand-held amber lantern. Use three cloak planes; keep gold to a clasp, short stitching, and lantern hardware. Preserve the character's silhouette when facing away. Selection rings and host/Storyteller badges are renderer/UI elements, not permanent gold sprite outlines. Use an original broken-hour-ring motif for local decoration; do not reproduce another game's insignia.

## Interiors

Every room needs a purpose, a work/storage/rest arrangement, and one sign of recent use. Start with **three prop clusters**, not random floor scatter. Provide a clear **2-tile main route** from the entrance and at least 1 tile around secondary interactions. Furniture tops, front faces, contact shadows, and wall thickness follow exterior perspective and palette rules. Use a consistent dark cutaway border; black outside the room is acceptable.

| Room | Required lived-in cues |
| --- | --- |
| Cottage | Uneven bedding, boots/coat near entry, one meal or craft left on the table; vary furniture arrangement between households. |
| Tavern | Used mugs on only some tables, serving board, stocked and partly empty shelving, a repair or worn patch beside the bar. |
| Chapel | Candle stubs, folded cloth, a small maintenance cupboard, one repaired pew; keep altar and central aisle visually clear. |
| Clock tower | Supported gear train and axle, rope terminating at a mechanism, maintenance bench, oil can, accessible ladder. |
| Shop | Mixed package silhouettes, a ledger and wrapping space, a partially empty shelf, deliveries grouped near storage. |

Floors are lower contrast than furniture. Let fireplaces/candles illuminate nearby objects and leave readable cool ambient light elsewhere. Rugs show wear at passage points, not uniform decorative noise. Do not add a separate inventory's worth of props to every tile.

## UI and typography

Use near-opaque **Panel ink** (95–98%) for persistent panels, a 1 CSS px **Frame iron** keyline, restrained iron corner ornaments, and **Parchment** text. Use parchment-coloured cards with **Ink text** for readable notes/help; do not place a noisy paper texture behind text. Reserve gold for the primary action, focus, and a small number of headings. Use an 8 CSS px spacing rhythm and a consistent 4 CSS px corner radius.

Buttons have readable labels and distinct idle, hover, pressed, keyboard-focus, selected, and disabled states. Use a 2 CSS px gold focus ring. Disabled buttons retain legible text and show their reason nearby; never rely on near-invisibility. Prefer 40–44 CSS px control height, 16 CSS px body text, and 14 CSS px minimum metadata. Collapse optional voice/setup controls when inactive. Keep chat, player list, and the main action visually distinct.

Draw original **16×16** icons with 1 px contours and at most four palette colours; render at integer sizes. Pair icons with text/tooltips and accessible names. No emoji or borrowed role-token shapes.

| Meaning | Icon construction and distinction |
| --- | --- |
| Day / night phase | Eight-ray sun / crescent with one star; amber versus slate is secondary to shape. |
| Voting phase | A raised hand beside a short tally mark; selected vote adds a check and visible selected button state. |
| Alive / dead | Upright sprig with two leaves / plain memorial stone with a diagonal notch. Always include a text state in the roster. |
| Ghost vote available / spent | Small ghost beside one filled pip / same ghost beside a crossed empty pip. Include “Vote available” / “Vote spent”; do not equate dead with vote spent. |

Use free Google Fonts: **[IM Fell English](https://fonts.google.com/specimen/IM+Fell+English)** at 22–28 CSS px for short room names, phase headings, and the town title; **[Alegreya Sans](https://fonts.google.com/specimen/Alegreya+Sans)** at 16–18 CSS px, weights 400/600, for controls, chat, instructions, and labels. Avoid distressed serif text at tiny sizes and long all-caps passages. Suggested fallbacks: `Georgia, serif` and `system-ui, sans-serif`. Both families are listed under the Open Font License in Google's official metadata: [IM Fell English license metadata](https://github.com/google/fonts/blob/main/ofl/imfellenglish/METADATA.pb), [Alegreya Sans license metadata](https://github.com/google/fonts/blob/main/ofl/alegreyasans/METADATA.pb). Retain their license files when self-hosting. Use normal browser font rendering, 1.4 line height for body copy, and check text contrast against the final composited panel.

## Town structure proposals

Keep every existing main street centreline, river crossing, and building entrance connected. The following are local plot edits; dimensions are tile footprints to fit in available verge/yard space. Maintain a 2-tile route at entrances and do not narrow the present main streets. **A = new/revised assets; L = map/layout work.**

1. **Bell-founder's corner — A + L.** Place a 3×2 tile cracked bell on a low timber cradle on the square's northwest outer verge. Add a 1×1 plaque. Keep the central gathering ring free; this gives players a named meeting point without competing with the tower's height.
2. **Uneven cottage roofline — A + L.** Give three existing north-row houses, respectively, a 2-tile-wide dormer, a shallow side lean-to, and a stepped gable. Fit extensions inside their current plots; retain original doors and collisions unless explicitly updated. Repeat the local broken-hour motif once on a shutter, not on every facade.
3. **Rain garden at the tavern — A + L.** Convert a 4×3 tile patch beside the tavern into a stone runnel, rain barrel, and herbs. Add a short stepping-stone spur from the existing path. Keep a dry service route to the door; water should visibly drain downhill toward the nearest plot edge.
4. **Chapel memorial gate — A + L.** Replace only the cemetery entry segment with two narrow stone piers and a simple iron arch, keeping the current opening width. Add a 2×2 tile mourning yew within the fence and one maintained grave with fresh planting. Avoid a second clock or spire that competes with the chapel.
5. **Pond mending place — A + L.** Use a 3×2 tile shore patch for a short timber landing, a repair stool, and a drying net. Connect it with the existing dirt approach; add a crescent of reeds outside the landing. Keep the pond outline mostly intact and preserve bank walking space.
6. **Garden's missing corner — A + L.** Replace one 3×3 tile hedge corner with a curved herb bed, a potting shelf, and two stepping stones. Preserve the formal fountain axis and boundary. One asymmetry makes the garden recognizable while retaining its orderly plan.
7. **Eastern bridge address — A + L.** Add a 2×2 tile roadside recess on the west approach to the central bridge, containing a water-level post and a compact roofed noticeboard. Use a unique teal-slated cap. Keep bridge width and rail collisions unchanged; the recess is off the through-route.

## Do / don't and acceptance

| Do | Don't |
| --- | --- |
| Establish silhouette and three value masses first. | Add texture to rescue an unreadable shape. |
| Cluster wear where people walk and work. | Distribute identical damage, flowers, and noise everywhere. |
| Reuse material ramps and native pixel scale. | Enlarge a low-resolution prop to fit or mix outlined and painted styles. |
| Show state with shape, label, and colour together. | Make hidden roles visible through costume or rely on tint alone. |
| Preserve the street grid and clear gathering spaces. | Fill every open patch or obstruct entrances with landmark props. |
| Create Hollowmere's own signs, motifs, and icons. | Trace, recolour, or imitate an existing game's recognizable art. |

Before accepting an asset family, inspect native pixels plus 2× and 4× in the real client, day and night, on grass and cobbles. Preview every character direction and walking frame, including ghosts; check held props and foot anchors. Test a full crowd for label overlap and tower occlusion, and walk behind trees, benches, and door frames. Use the same camera positions for before/after screenshots. Approve one representative block before expanding the remaster across town.


## How this maps onto the codebase (art lead notes)

- **Where art lives.** Procedural generator: `packages/assets/scripts/*` (ground, buildings, props,
  characters, critters, presets). AI remasters: `packages/assets/ai/` (jobs, prompts, raw outputs,
  deterministic post-processing in `ai/scripts/remaster.ts`, switch `CT_ASSETS_PROCEDURAL=1`).
  Outputs: `packages/assets/generated/` (atlases + manifests). Never hand-edit generated files.
- **Native sizes.** Tiles 16×16; characters 24×32, 5 frames (idle, walk1–4) × 4 rows (down, up,
  left, right), anchor (12, 30); object sprites anchor at the bottom-left of their anchor tile and
  must match `PROP_DEFS` w/h exactly (validated by the generator).
- **Lighting is runtime.** The client multiplies an ambient colour per phase and adds tinted light
  stamps (`TownScene.updateLighting`, `AmbientLayer`). Don't bake glow halos into sprites; lit
  window panes and flame cores are fine. Light points come from `PROP_DEFS[...].light` and the
  building window list.
- **Ambient life** (`packages/assets/src/ambient.ts`, `apps/client/src/game/AmbientLayer.ts`) may
  depend only on the wall clock, the public phase and map data — never on other entities' hidden
  positions (night privacy).
- **CMU easter eggs** follow everything above: `packages/assets/src/eggs/index.ts`
  (`EGG_PROP_DEFS`, `EGG_PROPS`, `EGG_STRUCTURES`, `EGG_SPRITES` → PNGs at native size with
  transparent background, palette above, 1 px Soot contour, light from the upper left) and
  `apps/client/src/game/eggs/index.ts` (`mountEggs(scene, ctx)`).
- **Acceptance** = the checklist above, in the real client (`packages/assets/ai/staging/_perf/review.ts`
  captures fixed camera spots by day/night, interiors and a 16-character crowd).

## Visual overhaul (2026-10-14): work split and 2× density contract

**Goal:** an atmospheric HD-2D-style gothic village at night (pixel sprites + dramatic light, fog,
glow, depth), stunning but comfy. Mood refs (third-party, never copied/committed):
`packages/assets/ai/refs/`.

**2× art density, logic unchanged.** All art is authored at 2× (32 texels per 16-px world tile;
characters 48×64 texels) and drawn at scale 0.5 in world units with nearest-neighbour sampling.
World coordinates, collision, doors, voice zones, server and protocol stay on the 16-px grid.
Camera zoom uses even values (2/4/6) so one texel = an integer number of screen pixels.

Manifest contract (packages/assets/generated, produced by `pnpm assets:generate`):
- `objects.json`: `density: 2`; frame rects in texels (2× the world size). Sprites anchor at the
  bottom-left of their anchor tile as before (world size = texels / 2).
- `town.json`: map `tilewidth/tileheight` 32 (texels), property `density: 2`; object and light
  x/y/width/height in texels (divide by 2 for world px); ground/decor layers use 32-texel tiles.
- `characters.json`: `density: 2`, frames 48×64 texels, anchor (24, 60) texels.
- `ambient.json`: anchors stay in world px.
- Missing 2× art falls back to a nearest-neighbour upscale of the 1× procedural frame (flagged in
  `generated/ai.json` as `upscaled`) until Astra's redraw lands — never shipped as final art.

**Who owns what (disjoint files):**
| Track | Owner | Files |
|---|---|---|
| Art pipeline + all Astra runs, 2× atlases, characters, buildings, terrain | assets/art lead | `packages/assets/scripts/{generate,buildings,characters,presets,critters,decals,ground}.ts`, `packages/assets/ai/**`, `packages/assets/src/{presets,index}.ts`, `apps/client/src/game/{sprites.ts,CosmeticPreview.tsx}`, `apps/client/public/art/**`, `apps/client/src/ui/common/RoleIcon.*` |
| Render core: TownScene refactor into modules, 2× rendering, camera (closer, smooth lag), foreground layer (parallax, DOF, fade), occlusion, light/air/moments | render sub-agent | `apps/client/src/game/{TownScene.ts,AmbientLayer.ts}`, `apps/client/src/game/render/**`, `apps/client/src/game/fx/**` |
| Sound effects + ambience (CC0), own volume | audio teammate (lead's team) | `apps/client/src/game/audio.ts`, `apps/client/src/game/sound/**`, `apps/client/public/audio/**` — TownScene call sites are relayed by the lead |
| Square showpiece layout + foreground placements + new prop sources | square sub-agent | `packages/assets/src/layout.ts`, `packages/assets/src/foreground.ts`, `packages/assets/scripts/{props,props-extra}.ts`, `packages/assets/src/ambient.ts` |
| Gameplay layer (seat circle, auto-walk) | gameplay teammate | `apps/client/src/game/gameplay/**` |
| CMU easter eggs | cmu-eggs teammate | `packages/assets/src/eggs/**`, `packages/assets/eggs/**`, `apps/client/src/game/eggs/**` |

## Status — paused 2026-10-15

Art/asset work is paused by user decision (the incremental remaster is judged a local minimum
relative to the HD-2D target; the art will be revisited with a different approach). Nothing is
committed. The working tree builds and tests green on hshi-u1: `pnpm -r run typecheck` ✓,
`pnpm --filter @ct/client build` ✓, `pnpm vitest run packages/assets apps/client` 6 files / 57 tests ✓,
`apps/server/test/world.nav.test.ts` 4/4 ✓; 16 walking characters at 16.6 ms mean frame time
(RTX 3060, headless Chromium, all quality tiers). Ownership of TownScene.ts and the render modules
passes back to the lead.

**Live in the game (integrated and working)**
- Density-2 art (32 texels/tile, 48×64 characters, drawn at 0.5 scale; logic on the 16-px grid):
  `pnpm assets:generate` defaults to it (`CT_ASSETS_DENSITY=1` regenerates the 1× set). 327 of
  371 frames/sheets are model redraws; 44 are Scale2x fallbacks (43 cmu-eggs sprites — they need
  2× versions from cmu-eggs — and the `stubble` flat).
- Showpiece square: raised kerb rim, clock-face mosaic under the voting circle, round dais,
  fountain, braziers, banners, bunting; clock tower drawn 1.4×/1.375× bigger than its footprint
  (`TOWER_HD`), live clock hands, swinging bells (`ambient.json bells`).
- 16 bold creature villagers (preset ids in `src/presets.ts`), unified ghosts (4 ghost styles +
  derived preset ghosts), the starry Storyteller, layered "advanced" layers redrawn (17 bases +
  colour-transfer variants), procedural walk cycles from the model's idle poses.
- Render core (apps/client/src/game/render/**, fx/**): 2× density, even-zoom camera (4 at
  1280×800) with lagging follow, foreground layer (arches, bunting, boughs, signs, laundry) with
  parallax/DOF/fade, occlusion cutaway, HD-2D-style lighting (warm pools, bloom, haze, fog bands,
  embers, cloud shadows, drizzle), bedtime/dawn moment, voice speaking rings + muted icon, quality
  tiers (`ct.fxQuality`) and reduced motion (`ct.reducedMotion`). Gameplay hooks (5), eggs mount,
  privacy filtering intact.
- UI/new art: role icons (`generated/roles/`, `RoleIcon.tsx`), UI icons + 9-slice frames
  (`public/art/ui/`), title scene + emblem (`public/art/`), gameplay markers
  (`generated/gameplay/`).

**Half-done / known gaps**
- Paved terrain at 2× (cobble, plaza, brick ring) still uses the 1× procedural texel (2×2 blocks);
  the model's paved textures were rejected (busy edging, seam bands). Water likewise.
- Window day/night states (critique 03 #9) not done: windows are baked lit in the sprites.
- Light spill blocking at opaque walls is not implemented.
- Night is still a graded/multiplied map rather than true staged depth (the user's main concern).
- `packages/assets/ai/raw/` is 76 MB (139 PNGs ≤1024 px): prune superseded raws before committing
  (`presets-*` human villagers, `bold-*` 1× creatures, `interior-home|public` v1, `terrain-*`,
  `tower-dais`, `bld-houses-*`/1× buildings) or move them to LFS.

**Model outputs worth keeping** (best of the pass): the 2× creature roster and Storyteller
(`hd-<preset>`, `hd-storyteller`), ghost styles (`hd-ghost-*`), the showpiece tower
(`hd-bld-clocktower`), all 2× buildings (`hd-bld-*`), square pieces (`hd-sq-*`), arches/bunting
(`hd-fg-*`), role icons (`roles-a/b`), UI icons/frames, title scene + emblem, gameplay markers,
and the style guide/critiques (`review-01..03`).

**What I'd do next (different approach)**
- Treat the town as staged scenes, not a uniformly lit map: author a few hero vantage points
  (square, tavern street, churchyard) as layered compositions (background parallax plates,
  midground architecture, foreground silhouettes) with real light geometry (normal/height maps
  or pre-baked light masks per sprite) so lights can wrap facades and cast shadows — the HD-2D
  look comes from that depth staging more than from post FX.
- Have the model design the hero scenes first as full-resolution key art per vantage point, then
  cut sprites/plates from them (instead of remastering procedural sprites one by one).
- Keep the density-2 pipeline, validation and capture tools (`ai/scripts/*`) — they work.
