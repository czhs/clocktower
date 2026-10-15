# Landing art: prompts and provenance

All landing art was generated with the **Codex CLI 0.156.1** (`codex exec -m gpt-6-sol -s workspace-write`, built-in
image generation) on 2026-10-15 by the landing teammate, then keyed/split/resized/encoded on hshi-u1
(Pillow + sharp 0.34.4). The art is original: no official Blood on the Clocktower artwork, logo, tokens or Grimoire
were used or imitated. References attached with `-i` were only this project's own art:
`packages/assets/ai/target/camera/camera-C-low.png` (v2 town-square reference), `packages/assets/ai/refs/mood-hd2d-atmosphere.webp`
and `docs/screenshots/visual-street-night.png`.

Raw outputs (60 images, ~70 MB) stay in `_staging/<job>/` (gitignored), each with `PROMPT.txt` (the brief) and `NOTES.md`
(sol's exact per-image prompts). The post-processing scripts are summarised at the end.

## Shared preamble (prepended to every brief)

```
You are an art generator for "Clocktower Town", a cozy-but-mysterious gothic village game played in the browser (friends walk around a pixel-art town and play a social-deduction game with a human Storyteller). We are building its FIRST SCREEN (sign-in / create account landing page) and need web assets.

HOW TO WORK
- Use your built-in image generation tool to create the images described below. Generate each image separately (do not tile several unrelated assets on one canvas unless asked for a sheet).
- Generated images land in ~/.codex/generated_images/<thread>/. After generating, COPY every image you made into the current working directory with the exact filenames requested (PNG). Keep any extra variants too, named <name>-alt<N>.png.
- Do not edit any other files. Do not run builds. Do not download anything from the internet.
- When done, write NOTES.md in the working directory: one line per file with what it is and the exact prompt you used.

STYLE (must match the game's art direction; the attached reference image(s) are our own in-game concept art and are the style authority)
- "HD-2D"-like painterly pixel art: crisp pixel clusters with soft painterly lighting and atmospheric depth, like a low diorama camera. Warm amber lamplight and windows against cool plum/indigo/blue-violet dusk. Plum-grey stone masonry, dark blue-slate roofs, timber framing, deep eaves, moss, flower boxes, chimney smoke, iron lanterns, burgundy banners with a simple ORIGINAL sigil.
- Cozy, inviting, slightly mysterious (whispers, night visits), never horror/gore. Restrained value hierarchy; no neon, no over-saturation, no heavy bloom.
- ALL art must be ORIGINAL. Do NOT imitate the official "Blood on the Clocktower" artwork, logo, character tokens or Grimoire; no existing trademarks; no text except where explicitly requested.
```

## Runs (12 generation jobs + 2 critique runs, all `-m gpt-6-sol`)

| Job | Images | Refs (`-i`) | Used for |
|---|---:|---|---|
| hero-a | 4 | camera-C, mood-hd2d | hero-a1 chosen as the base composition (tower left, calm sky right) |
| hero-b | 2 | camera-C, street-night | not used (lane views; busier centre) |
| hero-mobile | 2 | camera-C, mood-hd2d | hero-m2 chosen as the phone composition |
| pixel | 3 | hero-a1, hero-m2, camera-C | **pixel-a1-alt1 -> hero-d**, **pixel-m2 -> hero-m** (true pixel-art re-render to match v2) |
| layers-a1 | 4 | hero-a1 | superseded (painterly version of the planes) |
| layers-p | 4 | pixel-a1-alt1 | **plane-sky / plane-town / plane-near** (desktop parallax) |
| layers-m | 8 | pixel-m2 | made, not shipped (phones use a CSS drift on the composite instead of extra downloads) |
| logo | 6 | camera-C | **logo-1 -> logo**, **emblem-2 -> emblem-32/64/180/192** |
| ui | 7 | camera-C | divider chosen; first frame/buttons superseded by ui2 |
| ui2 | 5 | v2 landing screenshot, pixel-a1-alt1 | **frame-px-alt1 -> frame-px**, **btn-gold / btn-gold-hover / btn-iron** |
| props | 8 | camera-C | **clock-face, clock-hour, clock-minute, villager-1/5 (peeking owl + mushroom folk), window-2 (invited art), fog** |
| anim | 6 | camera-C | **lantern-flicker** (6-frame strip) |
| critique1 / critique2 | - | landing screenshots | sol scored v2 7-8/10 with 8 fixes; after fixes v6 9/9/8.5 (desktop/desktop/phone), "ship quality: yes" |

## Briefs

### hero-a

```
TASK: hero background scenes (full-bleed website background, 16:9 landscape, as large as the tool allows, e.g. 1536x1024 or wider).
The scene: the clock-tower town at deep dusk turning to night. A tall slender stone clock tower with a glowing ivory clock face and a belfry, seen from a low vantage across layered rooftops; cottages with warm lit windows (a couple with tiny villager silhouettes peeking out), iron street lanterns, a crescent or full moon behind thin clouds, stars, soft blue-violet fog drifting between rooftop layers, chimney smoke, distant forest and hills. Strong depth: dark soft foreground (rooftop edges, a lantern or a branch) in the corners, mid town, far misty backdrop.
COMPOSITION REQUIREMENT: a sign-in card and a logo will be overlaid by the website, so leave a CALM, low-detail area of sky/fog. 
Make these three images:
1. hero-a1.png: clock tower at about 28-35% from the left, rising high; the right half has calmer sky above, rooftops and fog below (the card will sit on the right-centre).
2. hero-a2.png: clock tower centred at the back, smaller and further away; a calm moonlit sky band across the upper-middle, the town framing both sides and the bottom (the logo will sit in the sky, the card in the lower centre).
3. hero-a3.png: same idea as 1 but mirrored and at a slightly later, darker blue hour (tower right of centre at ~65-70%, calm area on the left).
```

### hero-b

```
TASK: hero background scenes for a website landing page (full-bleed, 16:9 landscape, as large as the tool allows).
Variation focus: looking down a cobbled lantern-lit lane toward the town square and its clock tower at dusk; warm doorways with wooden occupancy plaques, flower boxes, a cat on a step, light spilling onto wet cobbles, layered fog, the moon and first stars over the tower. Foreground: dark out-of-focus eaves/ivy and a hanging iron lantern in a top corner framing the view.
Leave a calm, low-detail region in the middle-upper sky (logo) and keep the centre-bottom slightly darker/quiet (a sign-in card will be overlaid there).
Make two images: hero-b1.png (dusk, violet-orange sky remnant at the horizon) and hero-b2.png (later night, deeper indigo, more fireflies/lamps, moonlight rim on roofs).
```

### hero-mobile

```
TASK: tall portrait hero backgrounds for PHONES (9:16 or the tallest portrait the tool allows, e.g. 1024x1536).
The scene: the clock-tower town at dusk/night seen from a low vantage. The tall stone clock tower with a glowing ivory clock face sits in the upper third, centred, with a moon and stars around it; the lower half is layered rooftops with warm windows (a few villager silhouettes peeking out), lanterns and soft blue-violet fog. A big calm fog/sky band in the middle (a logo and a sign-in card will be laid over the middle and lower-middle), darker framing at the bottom.
Make two images: hero-m1.png and hero-m2.png (m2 a little darker, more fog, a different moon position).
```

### pixel

```
TASK: re-render existing hero backgrounds as true HD-2D PIXEL ART so the landing page looks like the same game as our in-game art.
Attached images, in order: (1) hero-a1 (desktop 16:9 hero, tower left), (2) hero-m2 (phone portrait hero), (3) our in-game concept art (style authority: crisp, deliberate pixel clusters, limited palette per material, painterly light on top, warm lamps).
For each of (1) and (2), produce an image that keeps the SAME composition, layout, silhouettes, moon position, tower position, calm sky areas and lighting, but is rendered as handcrafted pixel art: clearly visible square pixel clusters (as if painted at roughly one third of the final resolution and upscaled with nearest-neighbour), clean pixel outlines on roofs/windows/lanterns, dithered or banded sky gradients, pixel-cluster fog and stars, warm amber windows with a few tiny villager silhouettes. No smooth photographic blur, no text.
Make:
1. pixel-a1.png (16:9 landscape, largest available) and pixel-a1-alt1.png (a second attempt, slightly chunkier pixels).
2. pixel-m2.png (portrait 9:16, largest available).
```

### layers-a1

```
TASK: split the attached hero image (hero-a1: night town, clock tower left, calm sky right) into PARALLAX PLANES by EDITING that exact image. Each output must keep the original's canvas size/aspect, camera, positions, lighting and style exactly; only remove/replace what is asked. These planes will be stacked in a web page and shifted by a few pixels each for a depth effect.
Make (use the attached image as the edit input for every one):
1. plane-sky.png: ONLY the sky: stars, moon, clouds and the most distant mountain silhouettes on the horizon. Remove the whole town, tower, forest, hills, houses, lanterns and foreground; continue the sky, distant mountains and a soft misty horizon down to the bottom of the frame. Opaque, no magenta.
2. plane-town.png: the town WITHOUT the near foreground: remove the dark nearest rooftops along the bottom edge, the ivy/flowers in the lower-left corner and the left wall-mounted lantern and building edge at the far left; continue the mid-distance town, streets, windows and fog naturally into the space they occupied. Keep the tower, the mid town and the far hills. Opaque.
3. mask-foreground.png: the ORIGINAL image where the near foreground (the dark nearest rooftops and chimneys along the bottom, the lower-left ivy/flowers, the far-left building edge with its hanging lantern, and any near right-edge cottage with its banner) is kept exactly, and EVERYTHING ELSE is replaced by flat pure magenta #FF00FF.
4. mask-skyline.png: the ORIGINAL image where the sky (stars, moon, clouds, sky gradient) is replaced by flat pure magenta #FF00FF and everything else (mountains, hills, forest, castle, tower, town, foreground) is kept exactly. The tower spire and roof edges must be cleanly cut.
```

### layers-p

```
TASK: split the attached hero image (pixel-a1-alt1: pixel-art night town, clock tower left, calm sky right) into PARALLAX PLANES by EDITING that exact image. Each output must keep the original's canvas size/aspect, camera, positions, lighting and style exactly; only remove/replace what is asked. These planes will be stacked in a web page and shifted by a few pixels each for a depth effect.
Make (use the attached image as the edit input for every one):
1. plane-sky.png: ONLY the sky: stars, moon, clouds and the most distant mountain silhouettes on the horizon. Remove the whole town, tower, forest, hills, houses, lanterns and foreground; continue the sky, distant mountains and a soft misty horizon down to the bottom of the frame. Opaque, no magenta.
2. plane-town.png: the town WITHOUT the near foreground: remove the dark nearest rooftops along the bottom edge, the ivy/flowers in the lower-left corner and the left wall-mounted lantern and building edge at the far left; continue the mid-distance town, streets, windows and fog naturally into the space they occupied. Keep the tower, the mid town and the far hills. Opaque.
3. mask-foreground.png: the ORIGINAL image where the near foreground (the dark nearest rooftops and chimneys along the bottom, the lower-left ivy/flowers, the far-left building edge with its hanging lantern, and any near right-edge cottage with its banner) is kept exactly, and EVERYTHING ELSE is replaced by flat pure magenta #FF00FF.
4. mask-skyline.png: the ORIGINAL image where the sky (stars, moon, clouds, sky gradient) is replaced by flat pure magenta #FF00FF and everything else (mountains, hills, forest, castle, tower, town, foreground) is kept exactly. The tower spire and roof edges must be cleanly cut.
The input is PIXEL ART: keep the exact pixel-art rendering (crisp pixel clusters, same palette); anything you continue/inpaint must be pixel art in the same style and pixel scale.
```

### layers-m

```
TASK: split the attached PHONE hero image (pixel-m2: portrait pixel-art night town, clock tower top centre, fog band in the middle, rooftops at the bottom) into PARALLAX PLANES by EDITING that exact image. Each output must keep the original's canvas size/aspect, camera, positions, lighting and pixel-art style exactly (crisp pixel clusters, same palette); only remove/replace what is asked.
Make (use the attached image as the edit input for every one):
1. plane-sky.png: ONLY the sky (stars, moon, clouds); remove the tower, town, forest and rooftops and continue the night sky and a soft blue-violet misty horizon down to the bottom. Opaque.
2. plane-town.png: the image WITHOUT the near foreground rooftops (remove the large near cottages/rooftops/chimneys/banners/lantern in the lower ~40% at left and right and bottom), continuing the misty mid town, fog and distant houses into that space. Opaque.
3. mask-foreground.png: the ORIGINAL image where the near foreground (the big near rooftops, chimneys, cottages with lit windows, banners and the hanging lantern in the lower part) is kept exactly and EVERYTHING ELSE is flat pure magenta #FF00FF.
4. mask-skyline.png: the ORIGINAL image with the sky (stars, moon, clouds, sky gradient) replaced by flat pure magenta #FF00FF and everything else kept exactly; the tower spire must be cleanly cut.
```

### logo

```
TASK: a logo / wordmark for the game, plus a small emblem.
Wordmark text, spelled EXACTLY: "Clocktower Town" (C-l-o-c-k-t-o-w-e-r  T-o-w-n). Two lines or one line are both fine. Every letter must be correct and legible.
Look: carved/gilded gothic-storybook lettering (blackletter-inspired but readable, like an old inn sign), aged brass/gold with dark plum outline and a subtle warm glow, integrated with ONE small original motif (a clock face replacing the "o" in Clocktower, or a tiny tower/clock above the words, or a wrought-iron flourish). Pixel-art crisp edges with painterly shading to match the reference.
IMPORTANT FOR CUTOUT: place every logo/emblem on a perfectly flat, uniform pure magenta background (#FF00FF), with no shadow, glow or texture touching the background colour at the edges (the glow must stay inside the letter outlines), so we can key it out. No other text.
Make:
1. logo-1.png, logo-2.png, logo-3.png, logo-4.png: four distinct wordmark designs (wide landscape canvas, e.g. 1536x1024 or 1536x640).
2. emblem-1.png, emblem-2.png: a square emblem/crest (no text) - a small clock-tower-and-moon or clock-face sigil inside a round or shield frame, readable at 32x32 favicon size (bold silhouette, few details), on pure magenta (#FF00FF).
```

### ui

```
TASK: UI frame art for the sign-in box, designed to be sliced as a CSS 9-slice border-image.
Every asset on a perfectly flat, uniform pure magenta background (#FF00FF) for keying, front-on orthographic view (no perspective), symmetrical, no text.
Make:
1. panel-stone.png: a portrait-ish rectangular frame (about 3:4) made of carved plum-grey stone with dark wrought-iron corner brackets and rivets, a thin brass inner bevel, and a DARK, nearly flat, slightly textured inner field (dark plum/indigo ink, low contrast so text on it reads). Corners ornate, edges a simple repeatable pattern (so the middle of each edge can stretch/repeat).
2. panel-wood.png: same idea in dark stained oak boards with iron strap hinges/corner plates and brass rivets; inner field dark.
3. panel-parchment.png: an iron-cornered frame around a dark aged-parchment/leather field (still dark enough for light text).
4. button-primary.png: a wide horizontal button plate (about 6:1) in burnished brass/gold with a dark amber centre field, iron end caps; EMPTY centre (no text).
5. button-primary-hover.png: the same plate, brighter, with a warm inner glow (same geometry exactly).
6. button-secondary.png: the same shape in dark iron/stone with a thin brass edge, dark centre (same geometry exactly).
7. divider.png: a thin horizontal ornamental divider (wrought iron flourish with a tiny clock in the middle), very wide (about 10:1).
```

### ui2

```
TASK: refine the sign-in card frame and buttons so they match the CHUNKY pixel scale of the background scene. Attached: (1) the current landing page screenshot (the frame/buttons there look too smooth/metallic compared to the chunky pixel background), (2) the background art.
Every asset on a perfectly flat, uniform pure magenta background (#FF00FF) for keying, front-on orthographic, symmetrical, no text. Draw as true pixel art at LOW resolution with visible chunky square pixels (as if drawn at about 1/4 of the output size and upscaled with nearest-neighbour), limited palette, no smooth gradients, no photographic metal.
Make:
1. frame-px.png: portrait (about 3:4) frame of plum-grey carved stone blocks with dark wrought-iron fleur corner brackets and brass rivets, a 1-pixel warm brass inner line, and a very dark plum/indigo inner field with subtle dithered texture. The frame edges must be uniform and repeatable between the corners (for 9-slice), corners ornate. Warm lantern light faintly catching the lower-right stones.
2. frame-px-alt1.png: same, slightly thinner border and simpler corners.
3. btn-gold-px.png: a wide (about 6:1) brass button plate with darker amber centre, iron end caps with a rivet; same chunky pixel scale; EMPTY centre.
4. btn-gold-hover-px.png: identical geometry, warmer and brighter with a soft inner glow.
5. btn-iron-px.png: identical geometry in dark iron with a thin dull-brass edge and dark centre (quieter, secondary).
```

### props

```
TASK: small decorative sprites that bring the landing page to life. Every asset on a perfectly flat, uniform pure magenta background (#FF00FF) for keying unless stated otherwise; no text.
Make:
1. lantern-hanging.png: an iron street lantern hanging from a short wrought-iron bracket, lit with warm amber glass (glow stays inside the glass, not on the background). Tall portrait canvas.
2. lantern-post.png: a lit lantern on a slender iron post with a small flower pot at the base.
3. clock-motif.png: an ornate round clock face (ivory dial, brass rim, roman-numeral-like tick marks drawn as simple marks, NO hands) seen straight on.
4. clock-hands.png: two separate ornate clock hands (hour and minute) in dark iron with brass tips, both pointing straight UP, side by side, with clear space between them.
5. window-villagers.png: a sheet of 6 separate lit cottage windows (arranged in a 3x2 grid with generous magenta gaps), each warm-lit with a different cute villager silhouette or character peeking out (an owl, a fox with a candle, a frog, a hooded figure, a cat, an empty curtained window). Small, readable, same scale.
6. embers.png: on a pure BLACK background (#000000) a sheet of 16 tiny glowing sprites in a 4x4 grid with large black gaps: fireflies (soft green-gold dots) and embers (orange sparks), each a few pixels with a soft glow (this one will be screen-blended so black = transparent).
7. fog-bank.png: on a pure BLACK background, a long horizontal wisp of soft blue-violet fog/mist (very wide, about 4:1), fading to black at all edges (screen-blended).
8. villager-silhouettes.png: 5 small standing villagers (animal folk in cloaks: owl, fox, frog, hooded storyteller with lantern, mushroom-cap person) in dark silhouette with a warm rim light, side by side with gaps.
```

### anim

```
TASK: short looping animation sprite sheets (frames must share the exact same canvas, geometry and pivot; only the flame/glow changes). Background pure magenta (#FF00FF), flat, for keying; no text.
Make:
1. lantern-flicker.png: a horizontal strip of 6 equally sized frames of the same lit hanging iron lantern; only the flame inside the glass flickers (size, brightness, lean) between frames. Frames separated by equal magenta gutters, aligned on a strict grid.
2. candle-flicker.png: a horizontal strip of 6 frames of a single candle in a small brass holder on a window sill, flame flickering.
3. moon-glow.png: on a pure BLACK background, a pale moon with a soft halo (will be screen-blended).
```

## Exact prompts of the shipped assets (from sol's NOTES.md)

- **pixel/pixel-a1-alt1.png**: pixel-a1-alt1.png — Desktop 16:9 hero with chunkier pixels. Prompt: Use case: style-transfer. Asset type: alternate 16:9 desktop landing-page hero background for Clocktower Town. Input Image 1 is the exact composition target; Input Image 2 is the in-game art style authority. Re-render Image 1 as original handcrafted HD-2D painterly PIXEL ART with visibly CHUNKIER square pixel clusters than a typical high-detail pixel painting, as if painted at about one quarter final resolution and nearest-neighbor upscaled. Preserve Image 1's clock tower left of center, crescent moon above-right of it, calm spacious right-hand sky, layered roofs and lanterns in the foreground, distant ridge, bridge and castle to the right, silhouettes, horizon and lighting. Match Image 2's deliberate pixel shapes and limited palette per material, with painterly light only over crisp clusters. Dithered or banded plum-to-indigo sky; blocky pixel-cluster fog, clouds and stars; stepped clean outlines on dark blue-slate roofs, amber windows, iron lanterns and plum-grey stone. Timber framing, deep eaves, moss, flower boxes, chimney smoke, burgundy banners with a simple original abstract sigil. A few tiny villager silhouettes inside windows. Cozy and slightly mysterious, restrained amber versus cool blue-violet dusk. Wide 16:9 landscape, largest available output. No lettering, logos, watermark, smooth photographic blur, neon, heavy bloom, horror or gore.

- **pixel/pixel-m2.png**: pixel-m2.png — Portrait 9:16 phone hero. Prompt: Use case: style-transfer. Asset type: 9:16 phone portrait landing-page hero background for Clocktower Town. Input Image 1 is the exact composition target; Input Image 2 is the in-game art style authority. Re-render Image 1 as original handcrafted HD-2D painterly PIXEL ART while preserving its portrait composition: dominant clock tower high in the upper middle, full moon just to its upper right, calm dark sky around them, layered fog and distant village descending through the center, close steep roofs and glowing windows framing both lower sides, lantern and burgundy banners, same silhouettes, architecture placements and lighting. Match Image 2's crisp deliberate square pixel clusters, as if painted around one third final resolution and nearest-neighbor upscaled, limited palette per material, painterly light over pixels. Dithered or banded plum-to-indigo sky; pixel-cluster fog, clouds and stars; clean stepped outlines on blue-slate roofs, amber windows, iron lanterns and plum-grey stone. Timber framing, deep eaves, moss, flower boxes, chimney smoke, burgundy banners bearing only a simple original abstract sigil. A few tiny villager silhouettes visible through warm lit windows. Cozy, inviting, slightly mysterious; restrained warm amber against cool blue-violet dusk. Portrait 9:16, largest available output. No lettering, logos, watermark, smooth photographic blur, neon, heavy bloom, horror or gore.

- **layers-p/plane-sky.png**: plane-sky.png — Opaque sky, distant mountains and mist plate. Prompt: Edit target: the supplied pixel-a1-alt1.png image. Create plane-sky.png, an opaque parallax sky plate at EXACTLY the source canvas dimensions, 1672 x 941, with the exact same camera, palette, pixel scale, star positions, crescent moon position, cloud shapes and dusk lighting. Preserve the existing sky and the most distant blue-violet mountain silhouettes on the horizon pixel-for-pixel wherever visible. Remove EVERY town element, clock tower, spires, castle, forest, nearer hills, houses, lanterns, banners, bridges, foreground roofs, ivy and flowers. Inpaint their old areas as seamless crisp painterly pixel-art sky, distant mountain silhouettes, and a soft misty horizon extending all the way to the bottom edge. No town structures or vegetation anywhere. No magenta, no transparency, no text, no logo. Do not repaint or redesign the sky that is already visible.

- **layers-p/plane-town.png**: plane-town.png — Opaque mid-town plate with near foreground removed. Prompt: Edit target: the supplied pixel-a1-alt1.png image. Create plane-town.png, an OPAQUE parallax middle-ground plate at EXACTLY the source canvas dimensions, 1672 x 941. Keep the original camera, positions, lighting, sky, moon, mountains, clock tower, mid-distance town, castle, distant hills, windows, banners, masonry and pixel-art palette precisely as in the input. Remove ONLY the near foreground: the dark closest rooftops and chimneys that span the bottom edge; the soft-focus ivy and flowers in the lower-left corner; the far-left building edge and its prominent hanging lantern; and the near right-edge cottage and its hanging banner. Continue the mid-distance town, streets, windows, rooflines, forest and fog naturally into these removed areas, at matching scale and perspective. Clean crisp pixel clusters with painterly dusk lighting. Do not alter the clock tower or other remaining structures. No transparency, no magenta, no text or logo.

- **layers-p/mask-foreground.png**: mask-foreground.png — Foreground chroma mask; kept pixels restored exactly from the source and key normalized to #FF00FF. Prompt: Edit target: the supplied pixel-a1-alt1.png image. Create mask-foreground.png, a pixel-perfect chroma-key mask image at EXACTLY the original 1672 x 941 canvas, with identical camera and exact original source pixels for every kept object. Keep ONLY these near-foreground original image regions: (1) the dark closest overlapping rooftops and chimney silhouettes touching and running along the bottom edge, (2) the large soft-focus ivy and flowers in the lower-left corner, (3) the building facade entering from the far-left edge with its prominent hanging iron lantern and adjacent climbing foliage, and (4) the near cottage entering from the right edge with its hanging burgundy banner and flowers. Preserve their exact silhouettes and internal original pixel art, warm lighting and colors; absolutely do not redraw, move, add or restyle them. Replace ALL other pixels — open sky, moon, clouds, mountains, castle, forest, clock tower, mid town, roads, bridge, and gaps around or between the kept foreground shapes — with a perfectly flat, perfectly solid, fully opaque pure magenta RGB #FF00FF (255,0,255), with no texture, gradients, haze or antialiasing in the magenta. Crisp pixel-step boundary on each silhouette. No transparency. This is a technical mask, not a new scene.

- **layers-p/mask-skyline.png**: mask-skyline.png — Skyline chroma mask; kept pixels restored exactly from the source and key normalized to #FF00FF. Prompt: Edit target: the supplied pixel-a1-alt1.png image. Create mask-skyline.png, an exact-source-pixel chroma-key skyline mask at EXACTLY the original 1672 x 941 canvas. Keep EVERY non-sky pixel of the original image exactly where it is and exactly as rendered: all distant mountain silhouettes and hills, forests, castle, clock tower and its thin spire, bridges, village houses, lanterns, ivy, flowers, banners, chimneys and foreground. Replace ONLY the sky region, including all stars, crescent moon, clouds and sky gradient above the mountain/forest/town skyline and visible through openings in the clock tower, with perfectly flat, perfectly uniform, fully opaque pure magenta RGB #FF00FF (255,0,255). This is a technical mask. Cut exactly along the original pixelated skyline, tower spire, roof eaves, trees and architectural openings with crisp pixel steps, no halo, feathering, gradients or haze. Do not redraw, move or restyle any kept image content. No transparency, text or logo.

- **logo/logo-1.png**: logo-1.png — Two-line gilded wordmark with central clock tower. Exact prompt: "Use case: logo-brand\nAsset type: landscape PNG wordmark for the first screen of a cozy gothic pixel-art browser game.\nPrimary request: Create one original, polished wordmark reading exactly \"Clocktower Town\". Spell the first word C-l-o-c-k-t-o-w-e-r and the second T-o-w-n. Two centered lines, \"Clocktower\" above \"Town\". Make every letter independently clear and readable. A tiny original stone clock tower silhouette rises over the center of the lettering; no other objects or text.\nStyle/medium: HD-2D-like painterly pixel art matching the supplied village concept art in mood and pixel density. Crisp stepped pixel clusters, carved gothic-storybook lettering inspired by an old inn sign, readable letterforms, aged brass and warm gold face with dark plum outlines and restrained internal amber highlights.\nComposition/framing: wide horizontal logo, generous empty margin all around, full design contained in the canvas with no cropping.\nLighting/mood: cozy and mysterious at blue-violet dusk; any warm glow remains entirely INSIDE the dark contours of the logo.\nBackground: perfectly flat, uniform, solid pure magenta RGB #FF00FF over the entire background, no gradient, no texture, no shadows, no cast glow, no ambient halo or antialias fringing into the background. Hard clean logo edges for color keying.\nConstraints: only the exact words \"Clocktower Town\"; no extra letters, subtitles, symbols resembling an existing game trademark, watermark, border, scenery, characters, or mockup. Original design."

- **logo/emblem-2.png**: emblem-2.png — Shield clock-face emblem. Exact prompt: "Use case: logo-brand. Asset type: original landscape wordmark for a cozy gothic pixel-art browser game's sign-in page. Reference image in conversation is STYLE reference only: HD-2D-like painterly pixel art with crisp pixel clusters, plum-grey stone, dark slate, warm amber against cool indigo dusk. Design original art; no imitation of existing game logos or trademarks. Text verbatim: \"Clocktower Town\". Spell C-l-o-c-k-t-o-w-e-r, a space, T-o-w-n. Every letter correct, separately legible, and readable at web size. Carved/gilded gothic-storybook lettering, blackletter-inspired but clear, aged brass-gold with dark plum outline, restrained internal warm highlights. Entire background must be flat pure magenta RGB #FF00FF, no texture, gradient, shadows, glow, or colored fringing outside silhouette; if image generation yields transparency instead, preserve clean alpha. No other text, no scenery, no mockup, no watermark. Wide landscape composition, centered and wholly within canvas, generous margin.\nSpecific design: Asset type: square emblem/crest with NO TEXT whatsoever. Create a compact shield-shaped dark-plum and aged-brass frame containing a large clock-face sigil with only two bold hands, a simple dark blue-slate peaked roof above it, and one tiny amber window below. Strong graphic silhouette, minimal details for 32x32 favicon readability. Centered square composition with generous magenta margin."

- **ui/divider.png**: divider.png — Wrought-iron divider with central clock. Exact prompt: Use case: game UI asset. Asset type: one isolated ornamental horizontal divider sprite for a gothic village sign-in panel. Create divider.png as ORIGINAL HD-2D-like painterly pixel art with crisp pixel clusters, subtle painterly amber glints and indigo shadows. Front-on orthographic, perfectly bilateral symmetrical, approximately 10:1 width-to-height. One very thin dark wrought-iron flourish stretching horizontally with restrained curls near the ends and a TINY antique circular clock exactly in the middle, its face warm muted ivory/amber and two simple hands, no numerals or text. Keep the decoration delicate, low profile, clean and fully visible with ample clear margin. Cozy and slightly mysterious, not horror. Entire background outside the ornament must be perfectly flat uniform pure magenta #FF00FF with clean hard edges and no shadow/glow extending into magenta. No other objects, no scenery, no logo, no existing trademark, no watermark.

- **ui2/frame-px-alt1.png**: frame-px-alt1.png — Thin-border portrait stone frame variant — Prompt: "Use case: stylized-concept\nAsset type: alternate web game sign-in card frame, isolated sprite for chroma key.\nPrimary request: One empty portrait frame, approximately 3:4 proportions, front-on orthographic and bilaterally symmetrical. Same art family and overall geometry as the previously generated Clocktower Town stone frame, but with a slightly thinner border and simpler dark wrought-iron fleur-like corner brackets. Plum-grey carved stone blocks, tiny brass rivets, a razor-thin warm brass inner line, and a very dark plum/indigo inner field with subtle pixel dithering. Uniform straight edge pattern between corners, suitable for nine-slice scaling. Faint amber lantern light on the lower-right stones.\nStyle reference: the provided Clocktower Town pixel-art dusk village image is the authority for chunky square pixel scale, muted indigo/plum stone, and amber lighting. Draw as TRUE low-resolution pixel art, as though authored at one quarter the final output dimensions and enlarged with nearest-neighbor. Strong visible square pixel clusters; hard pixel stair-steps; limited palette. Cozy, mysterious, original fantasy village UI.\nComposition: only this frame; all four outer corners and complete perimeter visible with generous pure magenta margin. Empty central field; no lettering or emblems.\nBackdrop: perfectly flat, uniform RGB #FF00FF magenta everywhere outside the object, with no shadows, gradients, texture, or stray pixels on the backdrop.\nAvoid: smooth curves, anti-aliasing, bevel gradients, realistic or photographic metal, glossy shine, bloom, 3D rendering, soft feathered edges, text, watermark, existing game logos or token art."

- **ui2/btn-gold-px.png**: btn-gold-px.png — Primary brass button plate — Prompt: "Use case: stylized-concept\nAsset type: web game primary button plate, isolated sprite for chroma key.\nPrimary request: One wide brass button plate, approximately 6:1 width-to-height, front-on orthographic and left-right symmetrical. Long straight-edged rectangular plate with modest stepped pixel corners, an EMPTY darker amber center sized for UI text to be overlaid later, thin warm brass perimeter, and dark wrought-iron end caps, each with one square brass rivet. Geometry is clean and repeatable, with broad undecorated central span for nine-slice scaling. Restrained tiny amber pixel highlights; no labels.\nStyle reference: the provided Clocktower Town dusk village image is the authority for chunky square pixel scale, warm amber against cool plum/indigo, and painterly pixel clusters. Draw as TRUE low-resolution pixel art, as though authored at one quarter the final output dimensions and enlarged with nearest-neighbor. Strong visible square pixel clusters, hard pixel stair-steps, limited palette. Cozy, mysterious, original fantasy game UI.\nComposition: one single horizontal button isolated in the middle; complete button and a generous clear margin all around.\nBackdrop: perfectly flat uniform pure RGB #FF00FF magenta everywhere outside the button, with no shadows, gradients, texture, or stray pixels on the backdrop.\nAvoid: text, symbols, smooth curves, anti-aliasing, gradients, metallic shine, photographic metal, bloom, 3D rendering, soft feathered edges, watermark, existing game logos or tokens."

- **ui2/btn-gold-hover-px.png**: btn-gold-hover-px.png — Brighter brass hover button plate — Prompt: "Use case: precise-object-edit\nAsset type: hover state of the Clocktower Town web game primary button plate.\nInput image: the supplied generated brass button is the exact geometry and pixel-art style reference.\nPrimary request: Recolor only the existing button to its hovered state. Preserve the exact silhouette, proportions, placement, stepped pixel outline, end-cap shape, rivet positions, empty center, and chunky pixel size. Make the brass perimeter and darker amber center moderately warmer and brighter. Add a restrained soft INNER amber glow contained within the plate, made from discrete pixel clusters; no external glow or bloom. Keep iron end caps dark.\nBackdrop: perfectly flat uniform pure RGB #FF00FF magenta outside the button, with no shadows, gradients, texture, or stray pixels.\nStyle: true low-resolution pixel art with nearest-neighbor enlarged hard square pixels and limited palette.\nAvoid: any text, new ornaments, altered geometry, smooth gradients, photographic metal, anti-aliasing, external glow, soft feathered edges, watermark."

- **ui2/btn-iron-px.png**: btn-iron-px.png — Dark iron secondary button plate — Prompt: "Use case: precise-object-edit\nAsset type: secondary iron button plate for the Clocktower Town web game.\nInput image: the supplied generated brass button is the exact geometry and pixel-art style reference.\nPrimary request: Recolor only the existing button to a quiet dark-iron secondary state. Preserve the exact silhouette, proportions, placement, stepped pixel outline, end-cap shape, rivet positions, empty center, and chunky pixel size. The long plate is dark plum/charcoal iron with a very dark indigo center, a THIN dull-brass edge, and muted brass rivets. Keep center empty for UI text overlay. Restrained value contrast, no bright highlights.\nBackdrop: perfectly flat uniform pure RGB #FF00FF magenta outside the button, with no shadows, gradients, texture, or stray pixels.\nStyle: true low-resolution pixel art with nearest-neighbor enlarged hard square pixels and limited palette.\nAvoid: any text, new ornaments, altered geometry, smooth gradients, photographic metal, anti-aliasing, glow, soft feathered edges, watermark."

- **props/clock-motif.png**: clock-motif.png — Ornate handless clock face. Prompt: Create ONE original game UI sprite: an ornate round clock face seen perfectly straight on, centered, complete circle with margin. Warm ivory dial, aged brass rim, subtle engraved dark iron ornament, twelve simple roman-numeral-like tick marks drawn only as strokes (no numerals, letters, or numbers). Absolutely NO hands and NO center spindle. HD-2D-like painterly pixel art with crisp readable pixel clusters, subtle amber highlights and plum-blue shadows, matching a cozy mysterious gothic village at dusk. Background perfectly flat and uniform pure magenta #FF00FF across every corner and all space outside the clock; no gradient, shadow, vignette, texture, glow, or other objects. No text, logo, watermark, existing franchise motifs, or border.

- **props/clock-hands.png**: clock-hands.png — Separate hour and minute hands. Prompt: Create ONE original game UI sprite sheet with exactly TWO separate ornate clock hands: a shorter broad hour hand on the left and a longer slender minute hand on the right. Both point perfectly straight UP, each independently centered on its own vertical axis; their round pivot ends are at the bottom. Dark plum-blue iron with tiny antique brass tips and restrained engraved details. Generous empty gap between hands, no overlap, no clock face, no other parts. HD-2D-like painterly pixel art with crisp clusters and clean silhouettes, matching a cozy mysterious gothic village at dusk. Background is perfectly flat uniform pure magenta #FF00FF edge to edge, no gradient, texture, shadow or glow. No text, logo, watermark, existing franchise motifs, or border.

- **props/villager-silhouettes.png**: villager-silhouettes.png — Five cloaked villagers. Prompt: Create ONE original game UI sprite sheet of exactly FIVE small standing villagers, side by side at the same scale with generous empty gaps for easy cropping: owl folk in cloak, fox folk in cloak, frog folk in cloak, a hooded storyteller holding a tiny lantern, and a mushroom-cap person in cloak. Full bodies visible, each a distinct cute readable dark silhouette, subtle warm amber rim light on one side, plum-blue shadow detail, no facial detail beyond tiny readable hints. HD-2D-like painterly pixel art with crisp pixel clusters matching a cozy mysterious gothic village at dusk. Background outside figures is perfectly flat, uniform pure magenta #FF00FF edge to edge and in every gap; no gradient, texture, shadow or glow. No text, logo, watermark, existing franchise motifs, or border.

- **props/window-villagers.png**: window-villagers.png — Six cottage windows with villagers. Prompt: Create ONE original game UI sprite SHEET of exactly SIX separate small cottage windows arranged in a clean 3-column by 2-row grid. Each window same scale, with generous empty gaps between cells for easy cropping. Each has a plum-grey stone or dark timber frame, tiny slate eave, warm amber interior light and a distinct cute peeking subject: top row left owl, middle fox holding one candle, right frog; bottom row left hooded figure, middle cat, right EMPTY window with curtains. Characters must be legible as tiny silhouettes within their own windows. HD-2D-like painterly pixel art with crisp pixel clusters, cozy mysterious gothic village dusk palette and restrained lighting. Background outside windows is perfectly flat, uniform pure magenta #FF00FF including all grid gaps; no gradient, texture, shadow or glow there. No text, logo, watermark, existing franchise motifs, or border.

- **props/fog-bank.png**: fog-bank.png — Blue-violet fog wisp. Prompt: Create ONE original game VFX sprite: a single long horizontal wisp/bank of soft blue-violet and muted plum fog, very wide about 4:1 aspect ratio, low and gently undulating, airy wisps with subtle painterly pixel clusters. Cozy mysterious gothic village dusk mood, restrained values and color, no neon or bright white. Fog fades smoothly to pure black at ALL edges so it can be screen blended. Background must be pure BLACK #000000 and opaque, including all four corners; no scenery, silhouettes, stars, ground, or other objects. No text, logo, watermark, existing franchise motifs, or border.

- **anim/lantern-flicker.png**: Use case: stylized-concept Asset type: production game animation sprite sheet for a browser landing page. Input image: The attached Clocktower Town village concept is a STYLE REFERENCE only, not an edit target. Match its HD-2D-like painterly pixel art, crisp pixel clusters, soft painterly light, cozy mysterious gothic dusk palette. Primary request: Create ONE horizontal sprite strip of exactly SIX equally sized animation frames showing the SAME small hanging wrought-iron village lantern. A dark iron curved hanging hook and top cap, four-sided lantern cage with amber glass, one tiny amber flame inside. Composition: One row, six frames, strict uniform grid, equal pure-magenta gutters between frames and pure-magenta margin around the strip. In every frame lantern ironwork, hook, glass outline, scale, position, camera, and pivot are pixel-identical; ONLY the little flame inside the glass changes in size, brightness, and slight lean. Different subtle flame pose in each frame. No frame numbers or grid lines. Background: perfectly flat pure chroma magenta #FF00FF everywhere outside the lantern, including gutters. No texture, shadow, gradients, vignette, or glow spill on the magenta. Style/materials: original painterly pixel art, crisp pixel clusters, readable at small size; plum-grey wrought iron, restrained amber flame, cool indigo edge shading. Warm/cool balance from supplied reference. No neon, oversaturation, heavy bloom. Constraints: six frames exactly; identical lantern geometry and alignment; no text; no watermark; no logos or existing game marks; no characters; no extra objects.

## Post-processing (hshi-u1)

- Magenta key (#FF00FF): border-connected flood fill plus enclosed pure-key holes, soft edge alpha with colour
  un-mixing and light despill; trim; Lanczos resize to display size (frame 368 px wide, buttons 72 px tall, logo
  640 px wide, villagers 112 px tall, clock face 176 px).
- Parallax planes: `plane-town` alpha = skyline mask (dilated, 0.8 px feather); `plane-near` = the composite with the
  foreground mask as alpha (eroded, 1 px feather), so near pixels are exactly the composite's.
- Fog: black-background art converted to luminance alpha (screen-like over the scene).
- Encoding (sharp): scenes AVIF q52 + WebP q80 + mozjpeg q80 fallback; alpha planes WebP q80; sprites palette PNG;
  logo also WebP. Placeholders: 32x18 / 14x25 JPEGs inlined as data: URIs in landing.css.
- Shipped total: ~2.1 MB on disk including all format fallbacks. A desktop visit downloads ~0.75 MB of landing art
  (hero AVIF first, planes after idle), a phone ~0.41 MB.

