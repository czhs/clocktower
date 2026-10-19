# Emoji emotes: reactions in the pie and the dock, pin colour moved out of the way

The user's request: "replace the pins in the palette with emotes that spawn emojis above the character's head, save one slot
for the pin color — let pin color switching be stored somewhere else out of the way, since from playtesting different pins
are actually not that important".

This is the LIBRARY side (`src/ui/emotes/emoji.js`, `src/ui/hd/emoji.js`, two additive lines in the existing emotes
files). The demo (`src/demo/**`) is not touched; the integration steps are at the end of this doc.

## Why these 7

| key (number key) | glyph | why it earns a slot in a social-deduction game |
|---|---|---|
| `agree` (1) | thumbs up: the Point glove, gold cuff | "yes / I'm with you": the most common signal during nominations and claims, without voice |
| `disagree` (2) | thumbs down (same glove, flipped, re-lit) | the matching "no"; up and down read apart by silhouette alone |
| `question` (3) | a gold `?` | "explain?" / "who?": challenges a claim without accusing |
| `suspicious` (4) | two eyes glancing sideways | THE deduction signal: "I'm watching you" |
| `shocked` (5, label "Gasp") | gold face, raised brows, open mouth | reacting to a death, a reveal or a wild claim |
| `laugh` (6) | gold face, closed eyes, open grin, tears | social warmth; defuses a heated day |
| `heart` (7, label "Trust") | crimson heart | "I believe you": the counterpart of the eyes |

Alternates (drawn, on the sheet, same API: `emojiIcon('alarm', T)`):

- `alarm` (`!` in the danger ramp). It overlaps Gasp, and `!` is already the system alert pop (`E.popFrame('alert')`).
  Players would confuse the two.
- `thinking` (face, raised brow, hand on the chin). At 13 px it reads as a face with a smudge, and it says nothing that
  `?` does not.
- `shush` (finger over the lips). The finger and lips are a few pixels, so it is illegible at 1x. Private talk is voice's
  job anyway.

Palette: faces are a gold ramp (a warm candle tone, not emoji yellow), hands are the parchment glove with the gold cuff,
the heart is the crimson pin ramp, and features are `textInk`. Every glyph is outlined in its own line tone. They sit on
the dark bubble / ink, so they read on day grass and at night (`shots/ui-emoji/*-night.png`).

## Files

| file | what |
|---|---|
| `src/ui/emotes/emoji.js` (new) | 1x: the set, glyphs, world pop + timing, pie items, emote dock, pin-colour picker / settings row, auto colour, keys |
| `src/ui/hd/emoji.js` (new) | D=2: 26x26 glyphs (faces / eyes / heart / `?` rasterised from shapes; gloves EPX + re-lit), 62x62 pops with an EPX'd burst, HD caret / underline; `prepareEmojiHD` |
| `src/ui/emotes/art.js` (additive) | `export const shadeRows = shade`; `pieImage` uses `it.icon(T)` when an item carries one; no current-colour arc on an item with `current: true` |
| `src/ui/hd/emotes.js` (additive) | `pieIconHD` uses `it.icon(T).hd` (else a block upscale); the same `current` arc rule |
| `scenes/ui-emoji.js` (new) | gallery: `?scene=ui-emoji&page=pops\|pie\|dock\|sheet&tod=noon\|night` |
| `shots/ui-emoji/{sheet.mjs, contact.py}` (new) | node sprite sheets / contact sheet |
| `shots/ui-hd-wave2/regress.mjs` (extended) | passes 3 + 4 (below) |

## API (`import * as EJ from '../ui/emotes/emoji.js'`)

| symbol | |
|---|---|
| `EMOJI` / `EMOJI_ALT` | `[{ key, label, with(name) }]` in number-key order / the 3 alternates; `emojiInfo(key)` |
| `PIE_ORDER` | pie order clockwise after Point: agree, heart, laugh, shocked, question, suspicious, disagree |
| `emojiIcon(key, T)` | 13x13 glyph (11x11 art + its line); `.hd` 26x26 after `prepareEmojiHD` |
| `EMOJI_POP` | `{ w: 31, h: 31, anchor: { x: 15, y: 29 }, box: 17, small: 13 }`; HD: `EMOJI_POP_HD` (62x62, anchor (30, 58)) in `hd/emoji.js` |
| `emojiPopFrame(key, f, T)` | frame f 0..6 (below); `.hd` after `prepareEmojiHD` |
| `emojiPopState(t, t0, { ms, reduced })` | `{ f, bob }`, f −1 = hidden |
| `emojiPopLife(ms)` | seconds a pop is visible (for pruning) |
| `drawEmojiPop(img, x, top, key, T, t, t0, o)` | state + blit; the tail tip sits 1 px above `top` (= the label stack top, as `E.popFrame`); `img` may be a density world view |
| `pieItemsEmoji({ name, self, removable, color })` | the new pie items; `PIE_TITLE = 'Point, pin or react'` |
| `EMOTE_DOCK` | `{ w: 112, h: 90, cell: { w: 15, h: 23 }, colorW: 11 }` |
| `drawEmoteDock(img, x, y, T, o)` | the new dock; returns hit rects `point`, `pin`, `pinColor`, `emoji:<key>` ×7, `clear` |
| `drawPinPicker(img, x, y, T, o)` / `pinPickerSize()` / `pinPickerAt(dockX, dockY, rects)` | the compact colour popover; rects `color:auto`, `color:<c>` |
| `drawPinColorRow(img, x, y, T, o)` / `drawPinCells` / `pinCellsWidth()` | the same cells as a settings row ('Pin colour' + AUTO + 8 dots) |
| `autoPinColor(seatOrId, { taken })` | automatic colour: seat n → `PIN_COLORS[(n − 1) % 8]`, a string id → FNV-1a hash; `taken` (Set) skips colours already in use |
| `EMOJI_KEYS` / `emojiForCode(code)` | `Digit1..Digit7` → key |
| `EMOJI_TIMING` | `POP_MS 2700, BURST_FRAMES [1, 2, 2], BOB_FPS 2, DISSOLVE_FRAMES 6, COOLDOWN_MS 800` |

`prepareEmojiHD(T)` (`src/ui/hd/emoji.js`) installs `EJ.HD_HOOKS` once and attaches `.hd` to the icons of T. Call it
after `prepareWave2HD(T)`, because the dock's glove, pin glyph, colour dots and key caps get their HD art from the wave-2
prepares.

## The world pop (timing)

All frames use the existing pop's bubble, the speech bubble with the 3-row tail, at 17x17 so it fits the 13x13 glyph. The
canvas is larger so the burst and the bounce fit, and the anchor never moves. Steps are on the 30 Hz grid:

| f | grid frames | drawing |
|---|---|---|
| 0 | 1 | small empty bubble (13x13): the existing pops' f0 |
| 1 | 2 | full bubble + glyph, lifted 2 px, 6 short goldHi rays (goldLine line) 3 px out |
| 2 | 2 | lifted 1 px, the rays become single gold sparks 2-3 px further out |
| 3 | until t0 + 2.7 s | resting; the caller adds the 1-px bob at 2 fps (as `E.popState`) |
| 4..6 | 2 each | Bayer dissolve 25 / 50 / 75 % (15 fps), then gone |

The total is 2.9 s, with about 2.5 s of hold. Under reduced motion it is f3 for the whole hold, with no bob and no
dissolve. HD uses the same frames at D=2: a rounded HD bubble, a 1-px line and an EPX'd burst.

## Pie layout (same wedge-count rule as today)

9 wedges, or 10 with Remove at 6 o'clock, clockwise from 12 o'clock:
`Point · agree · heart · laugh · shocked · [Remove my pin] · question · suspicious · disagree · Pin`.

- Warm reactions are on the right and doubt is on the left; agree and disagree sit roughly opposite.
- The Pin wedge is at 11 o'clock, next to Point (both target something).
- Pin is ONE wedge in the player's current colour (`kind: 'pin', color, current: true`). It has no current-colour arc,
  because there is only one pin wedge. At the pin cap, put its index in `off` exactly as today.
- Emoji wedges are `kind: 'emoji'`. Their hot state is gold, like Point.

Captions name the target when the pie opened on a person: "Agree with Bram", "Suspicious of Bram", "Trust Bram".

## Dock layout (`drawEmoteDock`, 112x90)

1. **Toggles.** Point, then Pin (the pin glyph in the current colour, or `Pin n/6` greyed at the cap), then a split
   **colour button**: the colour dot over a caret. It opens the picker.
2. **Emoji row.** The 7 emoji, each over its number key. Hover gets an iron-hi cell; `active` (just sent) gets a gold cell.
3. **Clear my pins (n).**
4. **Key hints.** `[RIGHT] point [DRAG] menu` · `[F] pin [1-7] react` · `Click your pin: remove`.

## Pin colour: where it lives

- **Default:** each player gets an automatic colour, `autoPinColor(seat, { taken })`. The picker shows AUTO selected,
  with a gold underline under the colour it resolved to.
- **Out of the way:** the dock's small colour button opens `drawPinPicker`. It is placed right-aligned over the dock,
  with its tail on the button; use `pinPickerAt(dx, dy, rects)`.
- **Settings:** the same choice as a row, `drawPinColorRow`. For a DOM settings panel, use `PIN_COLORS` / `PIN_HEX` and
  the AUTO option.
- The pie never changes the colour.

## Demo integration (`src/demo/gameui.js`; the line numbers are from the copy at the time of writing)

Imports:

```js
import * as EJ from '../ui/emotes/emoji.js';
import { prepareEmojiHD, EMOJI_POP_HD } from '../ui/hd/emoji.js';
```

1. **Prepare.** In the z −1 callback, call `prepareEmojiHD(LL.tok)` right after `prepareWave2HD(...)`.

2. **Colour state** (around l. 290, `let color = 'crimson'`):
   - Replace it with `let colorAuto = true, color = EJ.autoPinColor(you.seat ?? you.id)`.
   - While `colorAuto` is on, recompute the colour when the seat changes. Pass `{ taken }` (the colours other players
     use) if the lobby knows them.
   - Persist a manual choice with `lsSet('ct-pin-color', c)`. Keep the `set color(c)` test hook (l. 1209).

3. **React:**

   ```js
   function react(key, target) {
     if (L.t - lastReact < EJ.EMOJI_TIMING.COOLDOWN_MS / 1000) return false;
     lastReact = L.t;
     if (target?.member || target?.ground) {
       const p = target.member ? target.member.pos : target.ground;
       demo.player.faceTo?.(p.x, p.z);
     }
     pop('you', 'emoji', key);
     events.emit('gameui:emoji', { key, target: target?.member?.slot ?? null });
     return true;
   }
   ```

   `pop` already keeps one pop per head, so a new reaction replaces the old one. Store the emoji key in the pop's third
   argument (today's `color` slot) or add an `emoji` field.

4. **Pie** (l. 386-408):
   - Build the items with `EJ.pieItemsEmoji({ name: t.member?.name ?? null, self: !!t.member?.you, removable: t.ownPin ? { mine: true } : null, color })`.
   - Pass `title: EJ.PIE_TITLE`.
   - The cap `off` set (l. 388) works as is: the Pin wedge is `kind: 'pin'`.
   - In the commit handler, add `else if (it.kind === 'emoji') react(it.emoji, t);`. `it.kind === 'pin'` keeps
     `dropPin(t, it.color)`; drop the `color = it.color` line, because the pie no longer changes the colour.
   - Draw with `E.drawPie(SV(), …)` unchanged. The emoji wedges are HD through the view.

5. **World pops** (l. 718-726):

   ```js
   const isE = q.kind === 'emoji';
   const ps = isE ? EJ.emojiPopState(t, q.t0, { reduced }) : E.popState(t, q.t0, { reduced });
   // prune: if (ps.f < 0 && t > q.t0 + 1) ...
   const pf = isE ? EJ.emojiPopFrame(q.color, ps.f, LL.tok) : E.popFrame(...);
   const A = isE ? EJ.EMOJI_POP.anchor : E.POP.anchor;
   ```

   Blit at `x - A.x, top - 1 - A.y - ps.bob`. With `L.hd`:

   ```js
   fastBlit(L.hd.world, pf.hd, L.hd.at(m.pos).x - AH.x, Math.round((top - 1 - ps.bob) * L.hd.k) - AH.y)
   ```

   where `AH = isE ? EMOJI_POP_HD.anchor : POP_HD.anchor` (wave-2 step 10).

6. **Broadcast to NPC / cast use.** Every member draws through the same `pops` list, so `pop(slot, 'emoji', key)` shows a
   reaction over any NPC. Suggested town-life hooks:
   - a vote passes or fails: `agree` / `disagree` from the voters;
   - a night death or execution: `shocked` from nearby members;
   - a nomination: `suspicious` from one or two random members;
   - chatter: an occasional `laugh`.

   Remote players (later) should send `gameui:emoji { key }` and call `pop(slot, 'emoji', key)` on receipt. The
   `question` fallback for a missing signature clip (l. 1282) stays as is.

7. **Dock** (l. 966-972, 1120-1122):
   - Replace `E.drawDock` / `E.DOCK` with `EJ.drawEmoteDock` / `EJ.EMOTE_DOCK`.
   - Use `hdPiece(EJ.EMOTE_DOCK.w + 2, EJ.EMOTE_DOCK.h + 2, (v) => EJ.drawEmoteDock(v, 0, 0, T, { mode, color, mine, hover: hk, active, picker: pickerOpen, touch }), d())`.
   - Add `active` (the last emoji for about 0.3 s) and `pickerOpen` to the cache key.
   - Hits:
     - `emoji:<k>`: `react(k, null)`;
     - `pinColor`: `pickerOpen = !pickerOpen`;
     - the old `swatch:` branch goes away.

8. **Picker:**
   - When `pickerOpen`, compute `const pk = EJ.pinPickerAt(dx, dy, r)`, then draw
     `EJ.drawPinPicker(view, pk.x, pk.y, T, { color, auto: colorAuto, autoColor: EJ.autoPinColor(...), hover, tailX: pk.tailX })`
     (or as an `hdPiece` of `EJ.pinPickerSize()`).
   - `color:auto`: set `colorAuto = true` and recompute the colour.
   - `color:<c>`: set `colorAuto = false; color = c`.
   - Close the picker on a pick, on Escape (l. 1189) and when the dock closes.
   - Put the same choice in the settings panel as a row (`EJ.drawPinColorRow`, or DOM).

9. **Keys:**
   - `Digit1..5` + `Space` are the action bar's character emotes (`src/demo/actionbar.js` EMOTES, `player.js`
     EMOTE_KEYS), so the reactions must not steal them globally.
   - While the emote dock is open (G), `Digit1..Digit7` send `EJ.emojiForCode(e.code)` (`react(key, null)`) and are
     eaten before the action-bar binding. While the pie is open, `1..7` commit the matching emoji wedge.
   - With the dock closed, the number keys behave as today.
   - `F` (drop a pin at the cursor) uses the current colour.
   - Optionally add an action-bar / tray entry "React (G, then 1-7)".

10. **Hint text.** `E.drawHint`'s first-run copy still says "Point & pins". If the demo shows it, pass new copy through a
    copy of the drawer, or leave it as is; it is not wrong.

## Verification (render-host, `PIXEL3D_RDIR=pixel3d-hd2`)

`tools/remote.sh node shots/ui-hd-wave2/regress.mjs` exits 0 and prints:

```
regress wave 2: pass 1 (no hooks) 1108 checks, 0 differences; pass 2 (hooks installed) 1108 checks, 0 differences
regress emoji: pass 3 (emoji hooks installed + drawn) 1108 checks, 0 differences; pass 4 (existing emotes HD paths vs pre-emoji src/ui) 76 checks, 0 differences
```

- **Pass 3.** Installs `prepareEmojiHD`, draws every emoji drawer (1x and through views), then reruns the whole 1x suite.
- **Pass 4.** Compares the wave-2 HD output of the existing emotes against `shots/ui-emoji/orig/ui`, a copy of `src/ui`
  taken on render-host before this work. It covers the old pie layout, `pieImageHD`, the pops' and the dock button's `.hd`,
  and the old dock.

`node shots/ui-hd/regress.mjs` reports 524 checks, 0 differences.

Shots (`shots/ui-emoji/`):

- `{pops,pie,dock,sheet}-{noon,night}.png`: 1280x720, today 1x on the left, D=2 on the right.
- `contact-sheet.png`: all 8 pages.
- `gif-noon/anim.gif`: the live row of all 7 pops, 3.6 s loop, 2.4 MB; `gif-noon/strip.png` holds its frames.
- `sheet/{icons,pops,ui}-{noon,night}.png`: node sheets (1x block x2 next to D=2).
- `z/`: zoom crops.

## Known limits

- In the mouse pie (R 36, 10 wedges) the 13-px thumbs touch their wedge's gap lines, like the 14-px Point glove does
  today. The touch pie has room.
- The emotes atlas bake (`src/ui/emotes/bake.js`) does not export the emoji frames yet. It would be additive: names
  `emote_emoji_<key>` and `emote_pop_emoji_<key>_<f>`.
- At 25 % the HD dissolve reads lighter than the 1x one (finer dither). Same as the wave-2 pops.
