# Easter-egg sprite prompt — job `eggs2x-fences`

Model: gpt-6-astra via `codex exec` (image generation tool). Attachments: `ref.png` (blockout sheet), `context.png` (where these sprites will stand, 2x).

---

You are painting NEW original pixel-art sprites for our own game "Clocktower Town": a gothic, whimsical village at night, top-down 3/4 view, 16 px per tile. They must blend into the existing town so well that nobody can tell they were added later.

Attached images:
1. `ref.png` (1536x1024): rough blockouts of the sprites, upscaled 5x with nearest-neighbour (1 art pixel = 5x5 screen pixels) on a flat pure magenta #FF00FF background (the magenta only marks empty space). The blockouts fix size, silhouette, footprint and the main colours; their detail is crude placeholder work.
2. `context.png`: a 2x crop of the current town (its real art), for palette, outline, lighting, perspective and scale.

Subject: the same stubby post-and-two-rail fence, so caked in decades of paint that every edge is rounded, in four different paint jobs of abstract stripes, blobs and drips.

DOUBLE DENSITY REDRAW: ref.png shows our current, approved sprites enlarged 2x (every original pixel is a 2x2 block, then upscaled 5x on the canvas). Redraw them at twice the pixel density — one NEW art pixel = 5x5 screen pixels, so each old pixel becomes 2x2 new pixels. Keep the design, colours, proportions and silhouette exactly; spend the extra resolution on crisper contours, finer texture clusters, smaller highlights, eyes and faces, and cleaner emissive cores.

Sprite placement on the 1536x1024 canvas (keep exactly):
- `egg_fence`: 128x64 art pixels, drawn at x=118..757, y=182..501 on the canvas
- `egg_fence_1`: 128x64 art pixels, drawn at x=778..1417, y=182..501 on the canvas
- `egg_fence_2`: 128x64 art pixels, drawn at x=118..757, y=522..841 on the canvas
- `egg_fence_3`: 128x64 art pixels, drawn at x=778..1417, y=522..841 on the canvas

Use your image generation tool to produce ONE new 1536x1024 PNG, using ref.png as the edit/reference input:
- Same silhouette, proportions, footprint and position on the canvas as the blockouts (each sprite fills the same rectangle and stands on the same bottom edge), same top-down 3/4 perspective, same main colours.
- Repaint every surface like a skilled pixel artist matching context.png: individual stones/planks/slates with lit top edges and shadowed lower edges, 3-4 value hue-shifted ramps (cool violet-blue shadows, warmer highlights), ambient occlusion where things meet the ground, moonlight from the upper left, warm amber glow in lit windows and lanterns with a small bright core.
- Clean readable silhouettes with a dark (not black) 1-art-pixel outline; no stray pixels.
- Strict pixel art: hard-edged square pixels on a grid of 5x5 screen pixels, limited palette, no anti-aliasing, no blur, no soft gradients, no painterly strokes, no photographic detail.
- Background: fully transparent (real alpha) everywhere outside the sprites; if transparency is impossible, flat pure magenta #FF00FF. No ground, no cast shadows on the background, no glow halos, no text, no labels, no borders, no grid lines.
- Follow the town's art direction (summarised): **Where art lives.** Procedural generator: `packages/assets/scripts/*` (ground, buildings, props, | **Native sizes.** Tiles 16×16; characters 24×32, 5 frames (idle, walk1–4) × 4 rows (down, up, | **Lighting is runtime.** The client multiplies an ambient colour per phase and adds tinted light | **Ambient life** (`packages/assets/src/ambient.ts`, `apps/client/src/game/AmbientLayer.ts`) may | **CMU easter eggs** follow everything above: `packages/assets/src/eggs/index.ts` | **Acceptance** = the checklist above, in the real client (`packages/assets/ai/staging/_perf/review.ts` | `objects.json`: `density: 2`; frame rects in texels (2× the world size). Sprites anchor at the | `town.json`: map `tilewidth/tileheight` 32 (texels), property `density: 2`; object and light | `characters.json`: `density: 2`, frames 48×64 texels, anchor (24, 60) texels. | `ambient.json`: anchors stay in world px. | Missing 2× art falls back to a nearest-neighbour upscale of the 1× procedural frame (flagged in
- Quality bar: stunning, lovingly hand-placed pixel art in the spirit of modern "HD-2D" gothic scenes, at the native pixel size: crisp clusters, rich hue-shifted shading, a cool moonlit rim light on upper-left edges, warm emissive cores in windows, lanterns and screens (they glow at night in the game), deep soft-edged contact shadows. Every material reads at 1x.
- These are new props for the same town, so they must look like they were painted by the same artist as the buildings and props in context.png: same palette, same dark outline, same moonlit lighting, same pixel density (1 art pixel = one grid cell).
- Keep every sprite readable at 1x: strong silhouette first, then 2-3 shading steps; tiny details may be single pixels.
- No legible text, numbers, letters, logos or real-world brand marks anywhere (paint strokes and engravings must stay abstract), except where a job explicitly asks for one symbol.

Call the image tool exactly once. It returns roughly 1254 px images; that is expected and fine (we rescale), so do not regenerate to fix the size or to adjust anything. Save the generated image as `out.png` in the current working directory (do not modify ref.png or context.png), then print the absolute path of out.png and where the image tool originally saved it.
