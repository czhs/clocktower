# Easter-egg sprite prompt — job `eggs-mascots`

Model: gpt-6-astra via `codex exec` (image generation tool). Attachments: `ref.png` (blockout sheet), `context.png` (where these sprites will stand, 2x).

---

You are painting NEW original pixel-art sprites for our own game "Clocktower Town": a gothic, whimsical village at night, top-down 3/4 view, 16 px per tile. They must blend into the existing town so well that nobody can tell they were added later.

Attached images:
1. `ref.png` (1536x1024): rough blockouts of the sprites, upscaled 8x with nearest-neighbour (1 art pixel = 8x8 screen pixels) on a flat pure magenta #FF00FF background (the magenta only marks empty space). The blockouts fix size, silhouette, footprint and the main colours; their detail is crude placeholder work.
2. `context.png`: a 2x crop of the current town (its real art), for palette, outline, lighting, perspective and scale.

Subject: chunky, bold, charming creature characters, all facing right, as animation frames: a dark shark fin wearing a tiny black French BERET, slicing the water with a foam wake (2 frames), and the same shark surfacing with a huge toothy grin, beret jauntily tilted; a round parrot perched on a twig wearing a black T-shirt with a white lambda (λ) on the chest, in three different plumages (each idle + wings out); a brown otter floating on her back in the water with a small orange harness, paws up holding a pebble (2 frames); a giraffe in a blue hoodie and a green scarf, long spotted neck, friendly face (open eyes, then blinking); a plump orange fox with a white chest and muzzle and black ears, sitting (ears relaxed, then one ear twitching); a small red panda with a white-marked face and a ringed tail (sitting, then standing up on its hind legs); a round brown hedgehog with little spikes (2 walking frames); a rounded green blob-shaped creature with a small black eye and a black clock-hand-like mark, peeking up (2 frames).

Sprite placement on the 1536x1024 canvas (keep exactly):
- `egg_requin_0`: 20x16 art pixels, drawn at x=80..239, y=144..271 on the canvas
- `egg_requin_1`: 20x16 art pixels, drawn at x=272..431, y=144..271 on the canvas
- `egg_requin_grin`: 24x16 art pixels, drawn at x=464..655, y=144..271 on the canvas
- `egg_polly_0_0`: 16x20 art pixels, drawn at x=688..815, y=112..271 on the canvas
- `egg_polly_0_1`: 16x20 art pixels, drawn at x=848..975, y=112..271 on the canvas
- `egg_polly_1_0`: 16x20 art pixels, drawn at x=1008..1135, y=112..271 on the canvas
- `egg_polly_1_1`: 16x20 art pixels, drawn at x=1168..1295, y=112..271 on the canvas
- `egg_polly_2_0`: 16x20 art pixels, drawn at x=1328..1455, y=112..271 on the canvas
- `egg_polly_2_1`: 16x20 art pixels, drawn at x=112..239, y=528..687 on the canvas
- `egg_opal_0`: 24x14 art pixels, drawn at x=272..463, y=576..687 on the canvas
- `egg_opal_1`: 24x14 art pixels, drawn at x=496..687, y=576..687 on the canvas
- `egg_cilantro_0`: 24x48 art pixels, drawn at x=720..911, y=304..687 on the canvas
- `egg_cilantro_1`: 24x48 art pixels, drawn at x=944..1135, y=304..687 on the canvas
- `egg_fox_0`: 32x24 art pixels, drawn at x=1168..1423, y=496..687 on the canvas
- `egg_fox_1`: 32x24 art pixels, drawn at x=160..415, y=720..911 on the canvas
- `egg_panda_0`: 16x18 art pixels, drawn at x=448..575, y=768..911 on the canvas
- `egg_panda_1`: 16x18 art pixels, drawn at x=608..735, y=768..911 on the canvas
- `egg_theo_0`: 16x12 art pixels, drawn at x=768..895, y=816..911 on the canvas
- `egg_theo_1`: 16x12 art pixels, drawn at x=928..1055, y=816..911 on the canvas
- `egg_greenting_0`: 16x16 art pixels, drawn at x=1088..1215, y=784..911 on the canvas
- `egg_greenting_1`: 16x16 art pixels, drawn at x=1248..1375, y=784..911 on the canvas

Use your image generation tool to produce ONE new 1536x1024 PNG, using ref.png as the edit/reference input:
- Same silhouette, proportions, footprint and position on the canvas as the blockouts (each sprite fills the same rectangle and stands on the same bottom edge), same top-down 3/4 perspective, same main colours.
- Repaint every surface like a skilled pixel artist matching context.png: individual stones/planks/slates with lit top edges and shadowed lower edges, 3-4 value hue-shifted ramps (cool violet-blue shadows, warmer highlights), ambient occlusion where things meet the ground, moonlight from the upper left, warm amber glow in lit windows and lanterns with a small bright core.
- Clean readable silhouettes with a dark (not black) 1-art-pixel outline; no stray pixels.
- Strict pixel art: hard-edged square pixels on a grid of 8x8 screen pixels, limited palette, no anti-aliasing, no blur, no soft gradients, no painterly strokes, no photographic detail.
- Background: fully transparent (real alpha) everywhere outside the sprites; if transparency is impossible, flat pure magenta #FF00FF. No ground, no cast shadows on the background, no glow halos, no text, no labels, no borders, no grid lines.
- Follow the town's art direction (summarised): **Where art lives.** Procedural generator: `packages/assets/scripts/*` (ground, buildings, props, | **Native sizes.** Tiles 16×16; characters 24×32, 5 frames (idle, walk1–4) × 4 rows (down, up, | **Lighting is runtime.** The client multiplies an ambient colour per phase and adds tinted light | **Ambient life** (`packages/assets/src/ambient.ts`, `apps/client/src/game/AmbientLayer.ts`) may | **CMU easter eggs** follow everything above: `packages/assets/src/eggs/index.ts` | **Acceptance** = the checklist above, in the real client (`packages/assets/ai/staging/_perf/review.ts` | `objects.json`: `density: 2`; frame rects in texels (2× the world size). Sprites anchor at the | `town.json`: map `tilewidth/tileheight` 32 (texels), property `density: 2`; object and light | `characters.json`: `density: 2`, frames 48×64 texels, anchor (24, 60) texels. | `ambient.json`: anchors stay in world px. | Missing 2× art falls back to a nearest-neighbour upscale of the 1× procedural frame (flagged in
- Quality bar: stunning, lovingly hand-placed pixel art in the spirit of modern "HD-2D" gothic scenes, at the native pixel size: crisp clusters, rich hue-shifted shading, a cool moonlit rim light on upper-left edges, warm emissive cores in windows, lanterns and screens (they glow at night in the game), deep soft-edged contact shadows. Every material reads at 1x.
- These are new props for the same town, so they must look like they were painted by the same artist as the buildings and props in context.png: same palette, same dark outline, same moonlit lighting, same pixel density (1 art pixel = one grid cell).
- Keep every sprite readable at 1x: strong silhouette first, then 2-3 shading steps; tiny details may be single pixels.
- No legible text, numbers, letters, logos or real-world brand marks anywhere (paint strokes and engravings must stay abstract), except where a job explicitly asks for one symbol.
- Style: bold and playful character design — simple rounded masses, oversized expressive eyes with a 1-pixel shine, 2-3 flat tones per material, a confident dark contour, clear readable poses. They are allowed to look out of place in the gothic village; that is the joke.
- Costume details must stay readable at 1x: the beret on the shark, the lambda on the parrot's black T-shirt, the giraffe's blue hoodie and green scarf, the otter's orange harness.
- STRICT SILHOUETTES: every sprite keeps the size and outline of its blockout; feet, perches and waterlines touch the same bottom edge.
- Frames of the same character must stay consistent; only the pose changes. The lambda is the only symbol allowed; no other letters or text.

Call the image tool exactly once. It returns roughly 1254 px images; that is expected and fine (we rescale), so do not regenerate to fix the size or to adjust anything. Save the generated image as `out.png` in the current working directory (do not modify ref.png or context.png), then print the absolute path of out.png and where the image tool originally saved it.
