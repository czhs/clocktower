# UI density, wave 2: hud, events, emotes, panels at D=2

Wave 2 of the density round (docs/UI.md §2.10, follow-up list §2.10.2). The four groups below now have real D=2 art.
Every piece is redrawn on the HD grid: 1-px lines, 1-px light/shadow bands, round curves, the D=2 fonts. Nothing is a
nearest-neighbour upscale. Each sprite is **exactly 2x** its 1x sprite, with the anchors doubled, so layouts, hit rects
and anchors carry over unchanged. Colours are the same tokens (or kit `ramp()` of a token), so day and night both work.

The 1x path is **byte-identical** (see Verification). Every HD path is opt-in: it only runs when a drawer is given a
density view, or when you call an `*HD` function directly.

## How it switches on

```js
import { prepareWave2HD, worldLayerHD, atHD, drawExecutionFxHD } from '../ui/hd/wave2.js';
prepareWave2HD(T);   // idempotent; cheap after the first call per token set
```

`prepareWave2HD(T)` runs the density round's `prepareHD(T)` plus the three wave-2 prepares:

- **`prepareHudHD()`** (`src/ui/hd/hud.js`):
  - Wraps every `HA.GLYPH` factory, so the sprite it returns carries `.hd`.
  - Fills `HA.HD_HOOKS`. Through a view, `drawClockChip`, `drawItalic`, `drawJoystick` and the toast rule draw HD.
    `badgeImg`, `voiceDot`, `wave`, `spinner`, `knob` and `dial` return their 1x image with `.hd` attached.
- **`prepareEventsHD(T)`** (`src/ui/hd/events.js`):
  - Attaches `.hd` to the `EV.framesFor(T)` frames.
  - Fills `EV.HD_HOOKS`. `drawCaption`, `drawBanner` and the vote-clock hand + hub draw HD when `L.screen` is a view.
- **`prepareEmotesHD(T)`** (`src/ui/hd/emotes.js`):
  - Attaches `.hd` to the memoized emotes sprites.
  - Fills `E.HD_HOOKS`. `drawPie` and `drawKbd` draw HD through a view. `dockButton` and `popFrame` return the 1x image
    with `.hd` attached.

The rule: **draw through a density view** (`L.hd.screenView`, an `hdPiece(w, h, fn, d)`, `L.hd.worldView`), and every
drawer of these groups is HD. Draw into a plain `PixelImage` and nothing changes. The hooks are global and installed
once; they never touch a plain-image call (`img.isView` guards).

## What is HD now

| group | item | HD art (file) | 1x size → HD |
|---|---|---|---|
| hud | all 28 `GLYPH`s: sun, dawn, moon, star, bell, ring, candle (phase chip); house, ghost, skull, lock, door, hand, snow, scales, leave, abort, pause, play, minus, plus, caretUp/Down, mic (+ muted slash); notebook, gear, help and close (the density round's art) | `GLYPH_HD` (hud.js) | 7→14, 9→18, 5→10 |
| hud | clock dial: bezel with glint, hour ticks, wedge, 2-tone hand, hub; paused = checker wedge + 2 bars | `dialHD` | 15→30 |
| hud | clock chip: urgent glow (rounded, 2 alpha steps), paused dashed keyline (3 on / 3 off), "+ time" pill | `drawClockChipHD2` (hook) | — |
| hud | phase chip: all icons + the dimmed visit candle (its `.hd` is kept on the tinted copy) | via view | — |
| hud | toasts: HD frame + text + ⚖/× glyphs + a finer left rule (3 HD px, lit edge and foot) | `toastRuleHD` (hook) | — |
| hud | role chip / role card: house, ghost and caret glyphs, badge, display@2 title, **pixel italic at D=2** | `badgeHD`, `drawItalicHD` (hooks) | 9→18 |
| hud | voice: dots (ok / live glow / wait / bad / idle), talk wave, mic chip | `voiceDotHD`, `waveHD` | 9→18, 7→14 |
| hud | joystick (finer rim: 2-px gold keyline, bevel arc, groove) + knob; use button (door / lock + italic) | `drawJoystickHD`, `knobHD` | 64→128, 28→56 |
| hud | spinner (round dots on a true circle), conn / loading banners, prompt (lock + italic), key hint, St clock buttons | `spinnerHD` | 9→18 |
| events | caption ribbon (swallowtail cut on the HD grid, 1-px line, 2-px keyline) + its 5 glyphs (moon / sun / bell / candle / hand) | `captionImageHD`, `captionEndHD`, `captionMidHD`, `captionGlyphHD`, `drawCaptionHD` (hook) | 15→30 tall |
| events | HUD vote clock: face (ticks, bevel), 8 seat-pip states (dead = dashed rim), hand + hub, digits / tally in tiny@2 / body@2 | `vcFaceHD`, `vcSeatHD`, `drawVoteHandHD` (hook) | 61→122, 11→22 |
| events | game start / end banners: ribbon ends, emblems (Scale2x motif, re-lit), title in body@4 (smoothed, the same size as the 1x 2x title) | `bannerEndHD`, `bannerMidHD`, `emblemHD`, `drawBannerHD` (hook) | 21→42 |
| events | execution / ghost / poof world pieces: bell over the label (3 swings), soul wisp (6), ghost reveal (4), Storyteller poof (6), memorial candle (3) | `bellHD`, `wispHD`, `revealHD`, `poofHD`, `candleHD`, `drawExecutionFxHD` | 2x each |
| emotes | radial pie: 1-px wedge lines, 1–2 HD px gaps, finer rim, hub with a 1-px dotted gold ring, the current-colour arc, HD icons (28-px glove, swatch pins, remove ×), open fan / commit / cancel steps, press dot, caption plate | `pieImageHD`, `drawPieHD` (hook) | (2R+7)² → 2x |
| emotes | emote pops: HD bubble + tail, point glove (Scale2x + re-lit), pin, ! and ?; pop / dissolve frames | `popFrameHD` (`.hd` on `E.popFrame`), `POP_HD.anchor` | 15×20→30×40 |
| emotes | dock-button ring (HD frame, lit inner keyline when open, 14-px colour dot), kbd caps in the dock, greyed (capped) swatches keep HD | `dockButtonHD` (`.hd`), `dockDotHD`, `drawKbdHD` (hook) | 26→52 |
| panels | DOM 9-slices at `--hdpx`: panel / parchment / modal (HD corner brackets), plain panel, 11 button states, segments, tabs + strip, inputs, rows (4 states), wells, tooltip, tip strip, danger banner, chips, unread / count badges, kbd, scrollbar, slider, checkbox / radio / switch, divider | `panelKitHD`, `buildPanelsCssHD`, `installPanelsHD` (panels.js) | insets 2x |

Not in this wave (still 1x blocks through a view; they draw correctly, just not finer):
- world vote hands, seat plaques, toll rings, glows (ground / world FX the demo does not draw at D=2);
- the panels glyph / icon classes, cursors, spinner, scroll caps;
- the night veil, dawn wash and execution dim. These write `.data` directly and stay on the 1x layers by design.

## Call-site switches in `src/demo/gameui.js`

These assume the density-round adoption in docs/UI.md §2.10.1: `L.hd`, `d()`, `SV()`, `hdPiece(…, d())` and a
`putS(im, x, y)` that fastBlits into `L.hd.screen` at `x·d, y·d`. Imports:
`prepareWave2HD, worldLayerHD, atHD, drawExecutionFxHD` (`../ui/hd/wave2.js`), `POP_HD` (`../ui/hd/emotes.js`) and
`installPanelsHD` (`../ui/hd/panels.js`).

1. **Prepare.** Add `L.add((LL) => { if (LL.hd) prepareWave2HD(LL.tok, { swatchIcon }); }, -1)` (z −1 runs before every
   other callback). It replaces the `prepareHD(T)` call from §2.10.1 step 7. Sprites cached BEFORE the first prepare
   (e.g. `cached('dockbtn…')`) have no `.hd`, so the prepare has to come first.
2. **Clock chip** (`shot.chip`):
   - Change `probe(w + 4, 19, (im) => HA.drawClockChip(im, 2, 2, T, {...o, t})).im` to
     `hdPiece(w + 4, 19, (v) => HA.drawClockChip(v, 2, 2, T, { ...o, t }), d())`. The hook draws `drawClockChipHD2`:
     HD dial, glow, dashes and pill. The density round's `drawClockChipHD` (§2.10.1 step 5) is superseded and no longer needed.
   - If the demo ever sets `urgent`, add `t` (its pulse band) to `shot.chipKey`.
3. **Phase chip.** Build it as `const tmp = hdPiece(120, 13, (v) => HA.drawPhaseChip(v, 118, 1, T, {...}), d()), r = tmp.r`,
   then crop with `tmp.crop(r.x * d(), 0, (r.w + 1) * d(), 13 * d())`. The icons are HD automatically.
4. **Toolbar.** Unchanged from §2.10.1 step 6 (`toolButtonHD`). The hud GLYPH notebook / gear / help now carry the same art.
5. **Toasts.**
   - Build `full` as `hdPiece(bw + 8, hh + 9, (v) => HA.drawToast(v, 4, 4, bw, T, {...}), d())` and add `d()` to the cache key.
   - Call `HA.envelopeFx(full.clone(), age, left, { reduced, ox: (tx - 4) * d(), oy: (ty - 4) * d() })` and offset by `r.dy * d()`.
   - Blit with `putS`.
6. **Caption + vote clock.** Use `EV.drawCaption(LS, EF, …)` and `EV.drawVoteHud(evHud, LS, EF, …)` with
   `LS = Object.create(LL, { screen: { get: () => SV() } })` (§2.10.1 step 10). Both are HD now: the ribbon and the
   face / pips / hand / hub / digits. Keep `EV.drawNightVeil` / `drawDawn` on `LL`.
7. **Execution FX** (the `layer: 'fx'` call):
   - With `L.hd`, use `drawExecutionFxHD(evHud, LL, F, m, exec.t0, { t, still: reduced })`. It draws the tolls on the
     1x ground and the bell / wisp / reveal on the HD world tier.
   - Keep `layer: 'dim'` on the 1x `LL`.
8. **Ghost FX** (wisp + reveal after a night death):
   - Set `const LW = L.hd ? worldLayerHD(LL) : LL`, `feet = LW.at(m.feet())` and
     `lt = L.hd ? Math.round(lt * L.hd.k / L.hd.d) : lt`.
   - Then call `EV.drawWisp(LW, F, …)` and `EV.put(LW.world, F, 'reveal_' + rd, …)`.
9. **Poof.** `EV.drawPoof(LW, F, LW.at(poof.pos), k, { appear: true })`.
10. **Emote pops** (pointDraw):
    - `const pf = E.popFrame(...)`. It carries `.hd` after the prepare.
    - With `L.hd`: `fastBlit(L.hd.world, pf.hd, L.hd.at(m.pos).x - POP_HD.anchor.x, Math.round((top - 1 - ps.bob) * L.hd.k) - POP_HD.anchor.y)`.
      Here `top` is the 1x stack row; this is the same conversion as the person pins in §2.10.1 step 12.
11. **Dock button.** The cached `E.dockButton(T, …)` has `.hd`. Use
    `L.hd ? fastBlit(L.hd.screen, btn.hd, (bxr - 1) * d(), (by - 1) * d()) : fastBlit(img, btn, …)`. The
    `goldFrame(avatar)` under it belongs to the portraits wave.
12. **Dock / armed pill.** `hdPiece(E.DOCK.w + 2, E.DOCK.h + 2, (v) => E.drawDock(v, 0, 0, T, {...}), d())`; the kbd caps
    and capped swatches are HD now, and the hit rects (`dk.r`) stay logical. Use `E.drawArmed(SV(), …)`.
13. **Pie.** `E.drawPie(SV(), pie.cx, pie.cy, T, st)`, with `pie.cx/cy` in logical px (§2.10.1 step 3 `toScreen`).
14. **Prompt / tip.** Build `piece(...)` and `tipImage` as `hdPiece` (§2.10.1 steps 4 and 8). The lock glyph, italic,
    kbd chips and × are HD.
15. **Action bar** (`src/demo/actionbar.js`). Once `AB.buttonInto(view, …)` exists (§2.10.1 step 9), any `HA.GLYPH` /
    emotes sprite it blits is HD after the prepare.
16. **DOM panels.**
    - In `setPx`, after `L` exists and `--hdpx` is set: `if (L.hd) installPanelsHD(document, L.tok)`. Call it again
      when the token set changes (day ↔ night); it swaps the style text.
    - Then add the class `ctp-hd` to the containers that should use the HD skin. These are `.ctn` (notebook) and the
      `.dui-*` panels, or `<html>` for everything.
    - The HD rules are `.ctp-hd <panels.css selector>` (one class more specific). Any demo override that has to keep the
      last word over the skin must therefore be on an element outside `.ctp-hd`, or have equal or higher specificity.

## Files

New: `src/ui/hd/hud.js`, `src/ui/hd/events.js`, `src/ui/hd/emotes.js`, `src/ui/hd/panels.js`, `src/ui/hd/wave2.js`,
`scenes/ui-density-wave2.js`, `shots/ui-hd-wave2/{regress.mjs, sheet-hud.mjs, sheet-wave2.mjs, crop.py}`, this doc.

Changed additively (the 1x output is byte-identical):

| file | change |
|---|---|
| `src/ui/hud/art.js` | `HD_HOOKS` + `hdOf`. Hooked: `drawClockChip`, `drawItalic`, `drawJoystick`, the toast rule, the `.hd` returns of `dial` / `badgeImg` / `voiceDot` / `wave` / `knob` / `spinner`, and the phase-chip candle copy keeps `.hd`. |
| `src/ui/events/draw.js` | `HD_HOOKS`. `drawCaption` / `drawBanner` take an opts object (same fields). Vote hand / hub hook. `dissolved()` keeps `.hd`. |
| `src/ui/emotes/art.js` | `HD_HOOKS`. Hooked: `drawPie`, `drawKbd`, the `dockButton` `.hd`, and `popFrame` (now `popFrame0` + an `.hd` attach). Greyed dock icons keep `.hd`. |

`kit.js`, `src/ui/hd/{art,draw,layers,css}.js` and `src/demo/**` are untouched.

## Verification (render-host)

- `tools/remote.sh node shots/ui-hd-wave2/regress.mjs` (PIXEL3D_RDIR=pixel3d-hd2): **1108 checks, 0 differences**
  before the hooks, and **1108 checks, 0 differences** after every prepare ran. It covers every hud drawer, every
  events frame and screen drawer, every emotes sprite and drawer, and the panel kit, at noon and night. The baseline
  is a copy of `src/ui` taken on render-host before wave 2 (`shots/ui-hd-wave2/orig/ui`; to redo it in another tree, copy
  `src/ui` there BEFORE merging the wave-2 files).
- `shots/ui-hd/regress.mjs` (the density round's kit check): 524 checks, 0 differences.
- Sheets: `node shots/ui-hd-wave2/sheet-hud.mjs` reports "sizes: all exactly 2x" (`shots/ui-hd-wave2/sheet/`).

## Comparisons (`shots/ui-hd-wave2/`)

`scenes/ui-density-wave2.js` (`?page=hud|hud2|events|emotes|panels&tod=noon|night`): the left half is today's 1x, the
right half is D=2. Both halves call the same drawers with the same state. Full frames are
`<page>-<1280|1920>-<noon|night>.png` plus `hud-1920-noon-floor.png` (`uipolicy=floor`). 3x crops (1x on top, D=2
below) are `zoom-1280-<noon|night>-<item>.png`; 2x crops at 1080p are `zoom-1920-noon-<item>.png`, where the D=2 art is
4/3 the size under the 'round' policy. Sprite sheets (1x block-x2 next to HD) are in `sheet/`.

## Known limits

- **1080p, 'round' policy.** The HD half is 4/3 the size of the 1x half (§2.10 scale rule). `floor` gives 2/3.
- **Global glyph wrap.** `prepareHudHD` wraps `HA.GLYPH` globally, like the density round's `prepareHD`.
- **Copies lose `.hd`.** A caller that clones or tints a hud / emotes sprite itself loses `.hd`, unless it copies it
  with `withHD(copy, src.hd, src.hdOff)`.
- **Execution FX timeline is duplicated.** `drawExecutionFxHD` copies the 'fx' timeline of `EV.drawExecution`
  (`TIMING.execution`); keep the two in sync.
- **Poof clouds read busier.** At 2x radii they get more rim crescents (finer billows) than the 1x.
