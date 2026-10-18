# UI — Clocktower v2 visuals → pixel3d asset library (contract; every UI agent reads this first)

> **Unattended-run rule:** never run a raw `rm` (use `tools/clean.sh shots/<dir>|out/<dir> ['*.png']` or a fresh folder),
> no sudo, nothing on game-host, no git commits. Renders run on render-host through `tools/remote.sh` / `tools/shot.sh` /
> `tools/uibake.sh`. LOOK at every PNG/GIF you rely on with the Read tool; never claim what you did not render.
> **Skipped (user):** the cast member in `pipeline/skip.txt` (`nicksong`), its icon/portrait and the "nick face" emote
> (`nick_face`, `NICK_FACE_MS`) — leave them out everywhere. `brianbi` has no pixel3d character (v2 HD import only): out
> of scope until it is ported. **Never edit** `src/town/**` (town session) or anything in `~/Desktop/pipgws`
> (read-only reference).

Owner: UI lead (this file §0–§4, `src/ui/kit.js`, `src/ui/layer.js`, `src/ui/placeholders.js`, `src/ui/*-bake.js`,
`scenes/ui-hud.js`, `scenes/ui-bake.js`, `tools/uibake.*`, `refs/ui/**`). Groups append to §6 "Learnings" only.

What this is: the Clocktower v2 game's UI and in-world visuals (social atlas, portraits, labels, bubbles, HUD, clock,
panels, game-event FX) rebuilt in the pixel3d "3D pixel art" style as an **asset library**: atlases + manifests that
keep the v2 frame names (drop-in), the kit that draws them, and mock scenes over the 3D town square. Not the live game.

Quick start:
```
tools/shot.sh ui-hud shots/ui-<you>/hud.png --size 1280x720 --t 1 --q "tod=night&slots=1"   # the mock HUD + your slot
tools/uibake.sh <group>                    # bake out/ui/<group>.{png,json} + shots/ui-<group>/bake/<group>-sheet.png
tools/uibake.sh kit                        # kit atlas (fonts, frames, tokens) — reference bake
refs/ui/<group>/v2-*.png                   # the v2 originals, upscaled + labelled (regenerate: refs/ui/_src/make_refs.py)
```

---------------------------------------------------------------------------------------------------------------------

## 1. Inventory (v2 → owner group)

v2 paths are relative to `pipgws/`. "Tier" = how the new style draws it (§2.2): **W** 3D mesh in the world · **A**
anchored 2D (world layer, over everything) · **Ag** anchored 2D on the ground (under characters) · **S** screen 2D
(HUD layer) · **CSS** a DOM skin (9-slices / glyphs the DOM adopts). Sizes are v2 px (v2 world px ≈ new texels: a v2
character is 30–40 px tall, a pixel3d cast member at the game camera vh 12 is 33–47 texels).

Excluded (owned elsewhere): buildings, props, ground, foliage, interiors, the name-board prop and its pin
(`square-props board`, `board_pin`), `boarded*`, `shutters`, `unlit_*`, `doorglow`, `brazier_*`, `lamp_glow_*`, `smoke_*`
(town session) · `cat_*`, `pigeon_*`, NPC roaming (town life) · `firefly_*`, `ember_*`, `sparkle_*` (ambient library,
`src/ambient/*`) · cast sprites `cast.png`, `cast-ghosts.png`, `cast-hd.png`, `characters.png` + CosmeticPreview (the
cast pipeline: `characters/*`) · the night ambient multiply + window/lamp light stamps (sky.js presets + town lights) ·
`nick_face`, `icon_nicksong`, the nicksong portrait cells (skipped) · `icon_brianbi` + `cast-hd-portraits` (no pixel3d
character).

| # | element | v2 source | v2 drawn as | size / frames (v2 names) | how the game uses it | tier | group |
|---|---|---|---|---|---|---|---|
| 1 | map pins | `packages/assets/generated/social.{png,json}` (`scripts/social/pins.ts`), drawn by `apps/client/src/game/social/art.ts` + `index.ts` | world sprite | `pin_gold|crimson|violet|teal|green|orange|white|black` 18×26, anchor `pin` (8,25) = tip; icon disc `meta.pinIcon` {x9,y9,r6,left3,top3} | place pin: shadow + pin + dropper's `icon_<castId>` in the disc, y-sorted on the ground; person pin floats over the target's name (fans out when several, 1-px bob); ≤ 6 per member; click own pin = remove | A (person) / W or Ag+A (place) | markers |
| 2 | pin shadow | social `pin_shadow` | world sprite | 12×5, anchor (6,2) | under place pins only | Ag | markers |
| 3 | pin drop | social `pin_drop_0..3` | world sprite | 26×16 ×4, anchor (13,12), **14 fps** once (`DROP_MS 460`, `POP_MS 170`, `SETTLE_MS 900`) | sparkle when a pin lands | Ag | markers |
| 4 | pointing finger | social `point_<dir>_<f>` dirs right, down-right, down, down-left, left, up-left, up, up-right; f 0..2 | world sprite | 20×20 ×24, anchor (10,10), **8 fps**, sequence `[0,1,2,1]`, at emoterHead + vector×14 px (head ≈ feet − 26) | `EMOTE_POINT_MS 3500`; dir = nearest of `meta.point.vectors` to (target − emoter) | A | markers |
| 5 | ping | social `ping_0..3` | world sprite | 28×14 ×4, anchor (14,7), **10 fps** loop | at the pointed spot / the target's feet while the point lasts | Ag | markers |
| 6 | point trail | `game/social/index.ts` (code) | Phaser graphics | dotted 1-px line, marching | from the hand to the target while pointing; reduced motion = still | A | markers |
| 7 | pin remove badge | `game/social/art.ts` `BADGE` (code) | canvas texture | 9×9 red disc + white × | hover/tap on your own pin | A | markers |
| 8 | Storyteller pick crosshair | `game/gameplay/index.ts` (stagePick) | Phaser graphics | ring r5/6 + 4 ticks, gold on soot, + label | ST "pick a point on the map" mode | A | markers |
| 9 | emote button icon | social `emote_point` | DOM `<img>` crop | 14×14 | palette/dock button for Point | S/CSS | emotes |
| 10 | radial pie menu | `apps/client/src/ui/social/PieMenu.tsx` + `pie.css`, logic `game/social/radial*.ts` | DOM overlay | radius 84 (mouse) / 104 (touch) CSS px, dead zone 20/28; wedges: `point`, `pin:<color>`×8, `unpin` (Remove); hot wedge, hub dot, caption ("Point or pin — drag to choose", "Pin Bram · teal") | right-drag / hold `RIGHT_HOLD_MS 250` / long-press `LONG_PRESS_MS 450`; sticky `PIE_STICKY_MS 8000` | S | emotes |
| 11 | social palette / dock | `ui/social/SocialPalette.tsx` + `social.css` | DOM panel | Point / Pin toggles, 8 colour swatches (selected ring), "Clear my pins (n)", key hints, tooltip; dock toggle = your portrait button with an armed dot | arms the next tap; picks the pin colour | S/CSS | emotes |
| 12 | in-world emote pop | (new; v2 only had the point hand + nick face) | — | pop above the head, 2-frame appear | brief: a small emote bubble over a character | A | emotes |
| 13 | name labels | `game/TownScene.ts` `Avatar.label` | Phaser Text (Alegreya Sans 700, stroke #0b0812) | ~8–10.5 CSS px; colours player #efe6cf, Storyteller #e8c76a, ghost #cfe6ee | over every visible avatar (ghost +4 px higher); always on top (depth 5200) | A | indicators |
| 14 | speech bubbles | `game/social/bubbles.ts`, `speech.ts` | Phaser graphics + Text | panel #211f2c 96 %, edge #8a7448, hi #343042, shadow #0b0812; ≤ 28 chars/line, ≤ 4 lines, 80 chars; 5–7 s (+25 ms/char), fade in 140 / out 600 ms; ≤ 6 shown (4 low tier) | chat lines of visible people only, stacked above the name | A | indicators |
| 15 | talking outline + glyph | `game/fx/talking.ts` (voice) | per-frame dilated silhouette + 3-bar glyph | 1-px outline pale gold #ffe7a3 (self: rose #ff8f8a), glyph 7×7 beside the name; setting behind/top | who is talking (voicePresence, ~300 ms debounce) | A (+ outline: W/post) | indicators |
| 16 | own-seat "You" marker | `game/gameplay/index.ts` (markers) | Text + triangle | gold "You" + chevron | your spot in the gathered circle | A | indicators |
| 17 | guidance arrow + door ring | `game/gameplay/index.ts` (hints) | Phaser graphics | arrow from you toward home door / seat; pulsing gold ellipse + bobbing chevron over the door | bedtime walk home, gathering | Ag + A | indicators |
| 18 | home compass pill | `ui/common/help.css` `.ct-compass*` (+ GameScreen) | DOM pill | arrow disc + "Your home · 22 steps" | bottom centre while outdoors | S | indicators |
| 19 | house-name callouts | `game/gameplay/houseNames.ts` | Text + round-rect band | owner name + tail over the door; dimmer at night | find homes | A | indicators |
| 20 | door-board occupant tokens | `game/gameplay/boardTokens.ts`, `doorTags.ts` | canvas textures | round tokens 22 tex px (11–20 world px), ghost = pale blue, ≤ 4 + "+N"; hover = name tooltip | who is inside (day only) | A | indicators |
| 21 | offscreen-player arrows | (new) | — | edge arrow + tiny portrait/name | brief item | S | indicators |
| 22 | voice presence in HUD | `ui/voice/index.tsx` + `voice.css` (`.ctv-dot*`, `.ctv-wave`, `.ctv-mic-*`, `.ctv-pill-talk`) | DOM | live/ok/wait/bad dots, wave bars, mic idle/live/muted, "On air" pill | voice dock status | S | hud |
| 23 | cast icons | social `icon_<castId>` (`scripts/social/icons.ts`) | world sprite + DOM | 12×12 round busts, anchor (6,6); `meta.headCrops` per id | in pin discs, UI avatars | A/S/CSS | portraits |
| 24 | cast portraits | `generated/cast-portraits.{png,json}` (`scripts/cast/portraits.ts`), `ui/common/castPortrait.ts` | DOM canvas crop | cells 32×40, dir `down`; playable: 5 frames (idle, walk1..4); storyteller + NPCs: 1; `<id>/ghost`, `<id>/ghost-spent`: 1 | picker, waiting room, notebook, palette dock button, ST script/grimoire rows | S/CSS | portraits |
| 25 | role plaques | `ui/common/RoleIcon.tsx` (+ `generated/roles/<id>.png` 32×32, not generated yet → CSS plaque fallback: initial + team ring) | DOM | 32 px native, ×2 steps | role card, grimoire, endgame | S/CSS | portraits |
| 26 | role / status chip | `ui/hud/index.tsx`, `hud.css` (`.cth-chip`, `.cth-status`, `.cth-house`, `.cth-badge`) | DOM | "EMPATH · ⌂ Ravenscroft · ①", "Dead · 👻 1 vote" | top-left, always | S | hud |
| 27 | role card | `ui/hud` (`.cth-rolecard`, `.cth-ability`, `.cth-align`, tabs Town/Notes/Crier) | DOM | expandable card | role info, alignment, chips | S | hud |
| 28 | clock chip + mini dial | `ui/clock/ClockChip.tsx`, `clock.css` (`.ctc-chip`, `.ctc-dial`, `.ctc-wedge`, `.ctc-time`, `.ctc-urgent`) | DOM + SVG | "Nominations open in 5:58" + "+ time"; stage colours nominations #c0413b / bedtime #6f7fd0 / day gold; `URGENT_MS 30 000`; paused | top centre | S | hud |
| 29 | clock proposal vote card | `ClockChip.tsx` (`.ctc-vote*`, `.ctc-tray`, `RESULT_MS 2800`) | DOM | Yes/No, "1 of 3 · 29 s", result line | automatic games | S | hud |
| 30 | Storyteller clock control | `ui/clock/StClock.tsx` (`.ctc-stctl*`) | DOM | stage step buttons | ST panel | S/CSS | hud |
| 31 | diegetic tower clock hands | `TownScene.drawTownClock()` | Phaser graphics over the tower face | wedge (stage colour, 50 % / 28 % paused), hand, pause bars, gold hub | the clock tower (town prop) shows the day clock | W (hands on the town's clock face) | hud |
| 32 | toolbar + phase chip | `ui/clock/clock.css` `.ct-toolbar`, `ui/common/help.css` `.ct-tb-glyph`, GameScreen | DOM buttons | notebook, Abort (host), ⚙, ?, ⇦ Leave; "Day 1 ☼" / "First night ☾" / "Game over ✦" | top right | S | hud |
| 33 | toasts | `ui/hud` `.cth-toasts`, `.cth-toast-{death,error,game_over}`; `help.css` `.ct-toast` | DOM | gold left rule, × close | game log lines, errors, deaths | S | hud |
| 34 | context hint + prompts | `ui/hud/hints.tsx` (`HINT_MS 6000`, sticky → pill), `game.css` `.ct-game-prompt`, `.ct-hint` | DOM | "Seated (seat 5).", "Walk in: X", locked door prompt, first-run key hints | context help | S | hud |
| 35 | countdown / timers | `ui/hud/shared.tsx` `Countdown`, `.ct-countdown(-low)` | DOM | m:ss, low state | votes, visits | S | hud |
| 36 | touch joystick + use | `game.css` `.ct-touch-*` | DOM | ring + gold knob, use button | phones | S | hud |
| 37 | connection banner | `game.css` `.ct-conn(-lost)`, `.ct-game-loading/failed` | DOM | banner / spinner | reconnecting | S | hud |
| 38 | bitmap font | `scripts/fx/font.ts` 3×5 lower-case (review sheets only); the game uses vector Alegreya Sans + IM Fell English (`ui/common/fonts.css`) | — | — | every text | all | kit (body + tiny) / hud (display font) |
| 39 | base theme | `ui/common/theme.css` | CSS tokens | ink #211f2c (96 %), iron #454250, parchment #e4d8ba, gold #d5b56a, good #7fa8d8, evil #e0625a, 4 px radius | every panel/button | CSS | kit tokens / panels |
| 40 | lobby + waiting room | `ui/lobby/*.tsx`, `lobby.css` (`.ct-waiting*`, `.ct-member*`, `.ct-badge-*`, `.ct-pick*`, `.ct-rec*`, `.ct-modal*`) | DOM | panels, member rows, badges (You/Host/Not ready/ST), character picker tiles, stats tiles | before the game | CSS | panels |
| 41 | notebook | `ui/notebook/*`, `notebook.css` (`.ctn-*`) | DOM | rows: portrait, name, seat, ★ ? ✗ toggles, role select, note field | player notes | CSS | panels |
| 41b | notebook Notes page (free text) | `ui/notebook/Notebook.tsx` (`.ctn-page`, `.ctn-text` textarea, `NOTEBOOK_TEXT_MAX 8000`, status `Saved / Saving… / Offline`, `.ctn-full` > 80 %) | DOM textarea under the seat list | new: a 2nd page behind Seats / Notes glyph tabs (`tab-glyph-seats|notes[-on]` 9x9 on 14x13 tabs): lined parchment sheet `notes-page` (9-slice l14 t3 r7 b5: punched holes every 10 px + rose margin), `notes-rule` (pitch 10), `notes-caret`, `notes-sel`, `notes-scroll-track|thumb`, `notes-quill` (empty state), `notes-status-*` | write anything; autosave (debounce 900 ms) | S + CSS (`out/ui/notebook.css`) | notebook |
| 41c | "reading the notebook" book (others see it) | (new; v2 has no in-world cue) | — | `book_<dir>_open_0..3`, `_hold_0..2`, `_close_0..2`, `_write_0..3` (quill) + ghost `bookghost_<dir>_*`, 8 dirs (v2 point dir names), 16x16, anchor (8,11) = grip point | shown exactly while that player's notebook is open; quill while typing | A-depth (depth-tested pass, order 302) | notebook |
| 42 | Storyteller panel | `ui/storyteller/*.tsx`, `storyteller.css` (`.cts-*`: phase stepper NOW/NEXT, seat grid, grimoire, visits, cues, deal) | DOM | dense tool panel | ST controls | CSS | panels |
| 43 | story / endgame | `ui/story/*`, `story.css` (`.cty-*`), `ui/hud` `.cth-endgame` | DOM | pamphlet, reveal table ("Good wins") | end of game | CSS | panels |
| 44 | chat | `ui/chat/*`, `chat.css` (`.ct-chat-*`, crier) | DOM | dock, tabs, peek line, unread badge | chat | CSS | panels |
| 45 | settings, help, intro, status, admin | `ui/common/Settings*.{tsx,css}`, `help.css`, `ui/intro/*`, `StatusScreen.tsx`, `ui/admin/*` | DOM | dialogs, tabs, switches, sliders, segmented controls, keys, spinner | menus | CSS | panels |
| 46 | interior card | `game.css` `.ct-inside*` | DOM | "Your home" title, who is here, Leave | inside a cottage | CSS | panels |
| 47 | voice panel body | `ui/voice/index.tsx`, `voice.css` (`.ctv`, rows, sliders, segmented PTT/Open mic) | DOM | panel | voice settings | CSS | panels |
| 48 | landing / hero | `ui/auth/Hero.tsx`, `landing.css` (fog, flies, glow, logo, cards) | DOM layers | animated hero | landing page | S/CSS | panels (low priority) |
| 49 | UI glyph icons | DOM text glyphs: ✎ ☽ ☼ ◎ ♫ ☾ ✷ ⚑ ↶ ⇆ ⌂ ⚙ ? ⇦ ✓ ✗ ★ 👻 ✋ ⚖ 📜 🔇 🎙 | text | — | buttons everywhere | S/CSS | panels |
| 50 | seat markers (circle) | `game/gameplay/index.ts` markers | Phaser graphics on the ground | stone ellipse 14×8 + contact shadow; own spot pulsing gold; dead = pale wisp; ST view: numbered discs | the gathered nomination circle | W or Ag | events |
| 51 | vote clock hand + nominee ring | `game/gameplay/index.ts` (clockAng), `ui/hud/hud.css` `.ct-voteclock`/`.ct-vc-*` (HUD SVG) | graphics + SVG | gold hand centre → voter, pulsing ring at the voter, red ring (#a65f4b clay) on the nominee; SVG ring of seats (yes/no/raised/dead) | voting | Ag + S | events |
| 52 | raised / locked hands | `game/gameplay/index.ts` hands | graphics | parchment hand with soot contour, bobbing outline = raised, solid gold = locked yes, gold cuff | voting | A | events |
| 53 | phase captions | `TownScene.onPhaseChange` → `.ct-game-caption` | DOM italic line | "Night falls…", "The bell tolls…", "Dawn breaks over Hollowmere." 3.5–4.2 s | phase changes | S | events |
| 54 | night fall / dawn | `TownScene.onPhaseChange` (`cam.fadeOut(650)`→`fadeIn(1600)` to #04020a; dawn `cam.flash(900, 70,40,50)`) | camera fade | full screen | phase transitions | S | events |
| 55 | Storyteller poof | `square-props poof_0..5` (`scripts/fx/particles.ts`), `TownScene.poof()` | world sprite | 32×40 ×6, anchor (16,38) feet, **14 fps** once (hide at f2, show at f3); fallback violet/gold spark ring 520 ms | ST teleport / appear / vanish | W/A | events |
| 56 | ghost treatment | cast `<id>/ghost`, `<id>/ghost-spent` sheets + client hover; `.cth-status` | sprite variant | pale blue, hover 2–3 px, halo while the ghost vote is unspent | dead players | W (character material) + A (halo) | events |
| 57 | light blobs | `square-props glow_warm/glow_cool` (32×32 additive), `lights.png` stamps; carried lights (ST lantern, player lantern at dusk, ghost glow) in `TownScene.updateLighting` | additive / multiply | — | night | W (PointLights) | events (transitions only) |
| 58 | game start / end banners | (v2: toasts + `.cth-endgame`) | DOM | — | brief item | S | events |
| 59 | execution / night death | v2: toast `.cth-toast-death`, `.cth-ann-death`; ghost appears | DOM | — | non-graphic, cozy-gothic (no gore) | S + A | events |

---------------------------------------------------------------------------------------------------------------------

## 2. The new-style UI language

### 2.1 Principles
1. **One pixel grid.** 1 UI px = 1 scene texel. The frame is 640×360 internal, integer-upscaled (×2 at 720p, ×3 at
   1080p). UI art is authored at that size and never scaled by a non-integer, rotated, filtered or sub-pixel positioned.
   Rubric #2 applies to UI exactly as to the world: every feature is a multiple of one texel.
2. **Same palette logic as the world** (ART_DIRECTION §0, rubric #5/#8): ≤ 3 tones per material + its line + an optional
   cream rim; lines are a darker, cooler shade of their own fill (never black, never one global ink); shadows cool
   (violet/slate), lights warm (cream/gold); no pure white or black.
3. **Gothic-cozy, readable first.** Ink panels, iron keylines, parchment text, gold only for primary actions, focus and
   the Storyteller (as v2 `theme.css`). Readability at game size beats ornament: text ≥ the body font, contrast ≥ 4.5:1
   for body text on its panel.
4. **Stepped, game-speed motion** on the 30 Hz grid (§2.8). Nothing glides; appear/disappear are 2–3-step pops and
   dissolves, never alpha fades.
5. **Drop-in.** Every atlas keeps the v2 frame names, anchors, fps and manifest keys (§3.4); new-style extras get new names.

### 2.2 Where each element lives: tiers (`src/ui/layer.js`)
| tier | what | how | occlusion / light | use for |
|---|---|---|---|---|
| **W** world 3D | real meshes in `engine.scene` | toon materials (`toonMesh`), outlines from the post pass, sprite policy for flats | depth-sorted, lit, shadowed, night-tinted | things that physically stand in the world: place pins (optionally), seat markers, poof particles, lantern lights, the tower clock hands, ghost material |
| **A** anchored | `L.world` image (padded low-res frame) composited at pass order **300** (after grade/vignette) | draw at `L.at(worldPos)` | always on top (like v2 labels at depth 5200); unlit — use the night token set | labels, bubbles, talking glyph, finger + trail, person pins, emote pops, raised hands, callouts, door tokens, crosshair |
| **Ag** anchored ground | `L.ground` image, same pass, drawn first | as A | hidden under characters (texels with `FLAG_CHAR`), drawn over ground and props | pings, pin shadows, seat discs, the "you are here" ring, guidance arrows, pin drop |
| **S** screen | `L.screen` (lowW×lowH) drawn after the upscale | fixed to the canvas, same integer scale | above everything; ignores the camera | HUD, chips, toasts, panels, pie menu, dock, captions, full-screen phase overlays |
| **CSS** | baked 9-slices / glyph strips for the real DOM UI | `border-image` + `image-rendering: pixelated` at integer `--px` (Porting §5) | DOM | lobby, notebook, storyteller, settings, chat |

A and Ag ride the camera's sub-texel offset exactly like the scene (measured: whole-texel pans add **0** crawl pixels;
`shots/ui-lead/r3/pang-*.png` vs the UI-less `panu-*` — the few remaining px are scene-side). Anchor rule: anchor
integer pixel = `L.at(p)` (floor), draw sprites by their v2 anchor so the same anchors work in both games.

### 2.3 Pixel rules
- **Outline:** every free-floating UI sprite over the world has a 1-px outline in its `line` tone (pins, finger, icons,
  hands, tokens). Text over the world: 1-px 8-neighbour ring in `labelLine` (`drawText({outline})`). Text on panels:
  no outline (optional 1-px `shadow` for gold titles). Panels: the frame line is the outline (§2.5).
- **Light direction** inside UI art: from the upper left (hi tone top/left, sh tone bottom/right), consistent for all
  groups, independent of the scene sun.
- **Alpha:** binary (0/255) for all art. Partial alpha only for (a) the `scrim` token behind modals, (b) banded glows
  (≤ 3 alpha steps, light FX only). No gradients, no anti-aliasing, no blur, no drop-shadow blur (shadows = 1-px solid
  `shadow` row/column).
- **Sizes at the game camera** (vh 12 = 30 px/m, yaw 0, pitch 30°): cast members 33–47 texels tall; head anchor =
  feet + (H + 0.1 m); a name label sits 1 px above the head anchor (cap 6 → label box 10 px incl. outline). Bubbles
  stack above the label (v2 order: pins > bubble > label). Keep world UI ≤ 1.5 character heights tall.
- **Palette audit:** `PixelImage.colors()` lists the distinct colours of a frame; each must trace to a token or a
  `ramp()` of a token (§2.7).

### 2.4 Pixel fonts (`FONTS` in kit.js, rendered: `shots/ui-kit/bake/kit-sheet.png`)
- **body** — proportional, cap height 6, x-height 4, descender 2, ascenders = cap; 1-px tracking, space 2; line advance
  9 (10 with an outline). Glyphs 1–5 px wide (most 4). Full ASCII + `· … × — – ← → ↑ ↓ ✓ ≡ ⚙ ♪ ☾`; accented letters
  fold to their base letter (NFD); unknown → `?`. Used for labels, bubbles, panel text, buttons, toasts. Reads like v2's
  ~10 CSS px labels (cap 12 screen px at 720p).
- **tiny** (= **label**) — 3×5 caps + digits + `- _ . + : / ! ? × % … # , · — – '` (v2 `scripts/fx/font.ts` glyphs,
  upper-cased), 1-px tracking; **M and W are 5 wide, N 4 wide** (module fix 2026-10-17: the 3-wide M/W/N read as H/H/П,
  "RMB" → "RHB", "NOMINATIONS" → "NOHINATIONS"). Identical to the hud group's `LABEL`; `FONTS.label` is an alias.
  Badges, seat numbers, counters, small caps captions ("NOMINATIONS IN"). Never for sentences.
- **display** (hud group delivers): a titling face for "Good wins", "Your home", panel titles, banners — cap 8–9,
  small-caps or a pixel serif nodding to IM Fell English; same glyph-table format (`G('rows', top)`). **Registered**
  (module fix): `src/ui/fonts.js registerGroupFonts()` puts the hud group's `DISPLAY` (`src/ui/hud/font.js`) into
  `FONTS.display`; `scenes/ui-hud.js` (so every scene built on `buildHudStage`) and `scenes/ui-bake.js` (every bake) call
  it before any group module loads. Use `{font: 'display'}` at 1x (never body at 2x). If the face is missing or broken,
  `drawText` falls back to body and warns once. kit.js never imports group modules (ownership + circular import).
- API: `drawText(img, x, y, s, {font, color, outline, shadow, align})` (y = cap top), `textWidth`, `wrapText(s, maxW,
  {maxLines})` (ellipsis), `drawRuns(img, x, y, [[text, color], …], {font, outline, shadow, align})` (coloured runs on one
  line; advances `textWidth(run) + tracking`, so runs never touch), `registerFont(key, font)`. The kit atlas (`out/ui/kit.json meta.bitmapFont`) lists every glyph frame + metrics for a
  Phaser BitmapText / canvas port.

### 2.5 Frame / 9-slice kit (`FRAMES`, `drawBox`)
Every box: 1-px outer **line** (darkest, cool) → 1-px **edge** ring (keyline: iron / gold / parchment-shadow) → flat
**fill**, with an optional 1-px **hi** row under the top edge and **sh** row above the bottom edge; corners `0` square,
`1` 1-px notch (default: reads as v2's 4 px radius at this scale), `2` 2-px round (pill chips); optional 1-px drop
shadow row. Styles: `panel`, `raised` (button), `hover`, `pressed` (1 px down: hi row on the left), `disabled`, `sunk`
(inputs/wells), `gold` (primary), `parchment` (cards, pamphlet), `bubble`, `tooltip`, `chip`, `chipGold`, `danger`.
Content inset = 2 px (+ padding 2–4 px). Minimum sizes: button 13 px tall (body text + 3/4 px), chip 11–13, row 24.
Baked 9-slices (panels group) use insets l/t/r 3, b 4 (incl. shadow) — `nineSlice(src, insets)` tiles edges/centre (no
stretching). Hover/press/selected/disabled must be distinguishable without colour alone (v2 rule): pressed shifts 1 px,
selected gets the gold edge.

### 2.6 Icon grid
| grid | live area | use | notes |
|---|---|---|---|
| 12×12 | disc r 6 | cast icons `icon_<castId>` (v2 size, kept), pin disc content | round bust, transparent outside the disc, 1-px line inside the 12 |
| 9×9 | 7 + line | inline glyphs next to text (talk bars, ghost, hand, lock, star, mic) | sits on the body baseline, cap-aligned |
| 16×16 | 14 + line | toolbar / dock / pie wedge icons, phase icons, UI glyph set `glyph_<name>` | pixel3d-style mini objects (2–3 tones + line), lit from the upper left |
| 24×24 | 22 + line | dock/voice portrait button, notebook avatars, offscreen arrows | portrait crop of the 3D render |
| 32×40 | cell | `cast-portraits` cells (v2 size, kept) | full-body idle `down` + walk1..4 |
| 32×32 | plaque | role plaques (v2 `RoleIcon` native) | team ring good/evil |
Icons are drawn, not shrunk: no downscaled renders (render the 3D character at the target texel size instead).

### 2.7 Colour tokens (`TOKENS.day|golden|night`, `tokens(tod)`)
| token | day | night | role |
|---|---|---|---|
| outline | #1A1524 | #13121F | outermost line of every UI box / sprite without its own ramp |
| shadow | #120E19 | #0C0B16 | 1-px drop shadows |
| ink / inkRaised / inkSunk | #2B2536 / #3A3247 / #211C2B | #221F33 / #2E2A44 / #1A1828 | panel / buttons, rows / wells, inputs |
| iron / ironHi / ironSh | #5E566C / #857A90 / #3F3849 | #4E5170 / #6E7396 / #33354B | keylines, bevels |
| text / textDim / textInk | #EEE3C8 / #B9AEBF / #2E2838 | #E2DDD3 / #A3A3BA / #2E2838 | parchment text, muted, text on parchment |
| parchment (+Hi, Sh, Line) | #E6D7B2 (#F4ECD4, #C2AE86, #7C6546) | same | cards, hands, finger |
| gold (+Hi, Sh, Line) | #E3BD62 (#F7E0A0, #A57B36, #5E4220) | #D9B766 (#EED9A2, #94743E, #4A3A26) | primary, focus, timers, "you" |
| good / evil / ok / warn / danger | #8DB8E6 / #E36E5E / #96C77E / #E8A24A / #D9584A | same | alignment, states |
| st / stViolet | #EBC96B / #8A5ACF | #E2C473 / — | Storyteller label / accents |
| ghost / ghostSh | #CFE6EE / #7FA6B8 | #BFDCEB / — | ghost labels, wisps |
| talk / self | #FFE7A3 / #FF9A8F | same | talking outline + glyph |
| labelText / labelLine | #F2E8CF / #1E1828 | #E4E0D6 / #141325 | in-world names |
| bubble / bubbleEdge / bubbleHi | #2B2536 / #8C7650 / #3D3548 | #221F33 / #7A6A55 / #33304A | speech bubble |
| scrim | rgba(20,15,30,150) | rgba(12,11,26,165) | the only translucent token |
| bedtime | #6F7FD0 | #6874C0 | v2 clock.css bedtime periwinkle (clock wedge / keyline) |
| parchment / Hi / Sh (night) | (day values above) | #D2C7AD / #E1DCCC / #AF9F82 (`nightTone()`: OKLab L −0.05, cooler; Line unchanged) | world parchment (finger, hands, pin sockets, callouts, '?') a touch dimmer at night; panels drawn with `L.tok` follow |
Variant ramps (not tokens: arrays): `VARIANT_RAMPS.ghost|spent|dead` / `variantRamps(T)` (dead follows the night
parchment), 5 steps dark → light, = `src/ui/portraits/style.js variantRamp()`; events / indicators use the same.
Pins: `PIN_RAMPS.black.line` is a LIGHT tone (#A49CB4, also `rim`) kept for compatibility (emotes uses it as the lit edge
of a black swatch on ink); art that outlines a pin with its own `line` uses `PIN_LIT` (black = dark body + dark line,
= markers `PIN_ART.black`).
`golden` = day with warmer ink/iron/text. World-anchored UI (A/Ag) switches token set with the scene preset (labels a
touch dimmer and cooler at night, like v2's dimmer house names); screen UI (S) may stay on one set (`day` panels read
fine at night — see `shots/ui-lead/r2/hud-night.png`). Pins and coloured sprites: `ramp(mid)` gives `{hi, mid, sh,
line}` in OKLab (light warmer, shadow cooler/violet, line darker+cooler); `PIN_RAMPS` = the 8 v2 pin colours.

### 2.8 Animation (game speed)
- All UI animation is a pure function of the stage time `t` (seconds; `L.t`). The grid is **30 Hz**; a drawing is held
  2 (15 fps), 3 (10 fps) or 4 (7.5 fps) grid frames (`holdsFor`, `frameAt(t, fps, n, {loop, seq})`, `gridTime`).
- v2 rates → new holds: `pin_drop` 14 fps → **15 (2)**, `point` 8 fps seq 0,1,2,1 → **7.5 (4)**, `ping` 10 → **10 (3)**,
  `poof` 14 → **15 (2)**, walk 13 fps (characters, not UI). Loops of decorative idles (talk glyph, pulses, bobs) 4–10 fps.
- Appear = 2-grid-frame pop (`envelope().pop`: frame 0 one step smaller/offset, then final), disappear = 3-step Bayer
  dissolve at 15 fps (`dissolve(img, k)`); never alpha fades. Bobs: 1 px, ≤ 2 fps (v2 person pins). Marching trails: 1
  px per step at 7.5 fps.
- Keep v2 durations exactly (they are game rules / UX tuning): `EMOTE_POINT_MS 3500`, `DROP_MS 460`, `POP_MS 170`,
  `SETTLE_MS 900`, bubbles 5–7 s, `HINT_MS 6000`, captions 3.5–4.2 s, `RESULT_MS 2800`, `PIE_STICKY_MS 8000`, night fade
  650 + 1600 ms, dawn flash 900 ms — expressed as whole grid frames (round to 1/30 s).
- Reduced motion (v2 `reducedMotion()`): no pops, bobs, marching or pulsing; state changes still show (as single frames).
- GIF evidence at **1× real time** (30 fps capture, `--size 640x360` + `tools/sheet.py gif --fps 30 --scale 2`).

### 2.9 UI critique criteria (in addition to ART_DIRECTION §4)
| # | criterion | 2 = |
|---|---|---|
| U1 | readable at game size | every text and icon legible in a 1280×720 capture at 1×; names distinguishable on busy cobbles and grass, day and night |
| U2 | grid + outline discipline | UI texels = scene texels, no mixels, 1-px lines in own-colour lines, no black |
| U3 | palette | every colour traces to a token or a ramp; ≤ 3 tones per material |
| U4 | belongs to the world | the UI looks like part of the pixel3d scene (shading direction, materials, cozy-gothic), not a flat web overlay |
| U5 | game speed + cadence | stepped on the 30 Hz grid, v2 durations kept, 1× GIFs read |
| U6 | drop-in completeness | every v2 frame name of the group present (`uibake --strict`), anchors/fps/meta keys kept |

---------------------------------------------------------------------------------------------------------------------

## 3. Contract

### 3.1 File ownership
| owner | files |
|---|---|
| UI lead | `docs/UI.md` §0–§5, `src/ui/kit.js`, `src/ui/layer.js`, `src/ui/placeholders.js`, `src/ui/kit-bake.js`, `src/ui/social-bake.js`, `src/ui/fonts.js`, `scenes/ui-hud.js`, `scenes/ui-bake.js`, `tools/uibake.{mjs,sh}`, `tools/uigif.sh`, `refs/ui/**`, `shots/ui-lead/`, `out/ui/kit.*`, `out/ui/social.*` |
| group `<g>` ∈ markers, emotes, indicators, portraits, hud, panels, events | `src/ui/<g>/**` (must contain `hud.js` + `bake.js`), `scenes/ui-<g>.js`, `shots/ui-<g>/`, `out/ui/<g>.{png,json}` (+ extra atlases named `out/ui/<g>-*.{png,json}` or the v2 file names listed in §4), append-only notes in §6 |
| read-only for UI agents | everything else: `src/core`, `src/world`, `src/post`, `src/chars`, `characters/*`, `src/ambient`, `src/town/**` (town session), `scenes/char-stage.js` (import its helpers, never edit) |
Shared needs (a kit helper, a token, a font glyph, a tool option): put a `CONTRACT-REQUEST:` line in your final report /
`module_issues`; the lead or the module fixer lands it. Do not copy-modify kit code into your folder except to prototype.

### 3.2 Kit + layers API (stable; extend additively)
- `kit.js`: `PixelImage` (`set/get/rect/hline/vline/frame/line/dotted/disc/ellipse/ring/blit/outline/crop/bbox/colors`),
  `rgba/hex/mix/withAlpha`, `toOklab/fromOklab`, `ramp(mid, {light, dark, line})`, `TOKENS/tokens(tod)`, `PIN_HEX`,
  `PIN_COLORS`, `PIN_RAMPS`, `FONTS`, `textWidth`, `wrapText`, `drawText`, `FRAMES`, `drawBox` (returns the content
  rect), `nineSlice`, `GRID_HZ`, `holdsFor`, `frameAt`, `gridTime`, `dissolve`, `envelope`, `packAtlas`, `atlasJson`,
  `toCanvas`, `loadImage`. Pure JS: no three.js, deterministic, no Math.random/Date.
  Module fix 2026-10-17 (additive): `drawRuns`, `registerFont`, `FONTS.label`, `annulus(img, cx, cy, rx, ry, c, {tx, ty,
  keep})` (clean elliptic ring, no pole spurs), `shade(img, {hi, mid, sh, line}, {diag})` (upper-left light on a flat
  `mid` sprite + line; shade after flips), `envelope(t, tIn, tOut, {outMs, holdFrames, popFrames})` (default unchanged:
  3 steps × 2 grid frames; v2 bubble `outMs: 600` → 6-frame holds), `steps(a, b, n)`, `VARIANT_RAMPS`, `variantRamps`,
  `PIN_LIT`, token `bedtime`.
- `layer.js`: `createUILayers(engine, {order 300, tod, timeFn})` → `L` with `L.world`, `L.ground`, `L.screen`
  (PixelImages, cleared every frame), `L.at(p)` / `L.atScreen(p)` (integer pixel of a world point), `L.onScreen(x,y,m)`,
  `L.add(fn(L), z)` / `L.remove(fn)` (draw callbacks, ascending z), `L.tok` (token set), `L.t` (UI clock), `L.enabled`,
  `L.screenEnabled`, `L.setTod(name)`. One `createUILayers` per page (the mock HUD creates it; group scenes get it from
  `buildHudStage`).
- `layer.js` depth-tested tier (module fix, opt-in): `L.useDepth()` once in setup, then `L.putDepth(src, x, y, d, k?)`
  with `d = L.depthOf(worldPoint)` (view depth, m) into `L.depthWorld`. Pass `ui-depth` (order 303, after `ui-world` and
  the group pin passes 301/302) keeps the scene texel where the scene is nearer than `d − L.depthEps` (0.25 m), and every
  `L.world` texel stays on top; nearer depth texels win. For upright world sprites on the ground (place pins, door
  tokens, seat signs). Same semantics as `src/ui/markers/pinPass.js`, which can migrate to it. Evidence: a bar 0.8 m
  behind the Storyteller is hidden by the body, one 0.8 m in front covers it, a label stays on top
  (module-fix scratch test, `ui-depth:303` in the pass list).

### 3.3 Scenes and the mock HUD slot
- `scenes/ui-hud.js` exports `buildHudStage(engine, params, {cast, storyteller, ring})` → `hud` = `{ engine, params, P,
  tod, tok, kit, ui (= L), terrain, place(r, angDeg), seatPos(seat), clock, cast: [{id, name, seat, role, clip, you,
  ghost, pos, height, head(), feet(), actor}], st, you, byId(id), bySeat(n), slots, groups }`. Params: `tod`, `slots=1`,
  `groups=a,b`, `placeholders=0`, `ui=0`, `screen=0`, `grass=0`, `grade=0`, `trees=0`, `cast=0`, `t=<s>` (freezes
  characters AND UI), `pan=dx,dy`, `vh` (default 12 = the game camera), `yaw`, `strict=1`, `heads=1`.
- Module fix 2026-10-17 additions to `hud` (all scenes built on `buildHudStage` get them):
  - `ui=0` is handled IN `buildHudStage`: the layers and every pipeline pass named `ui-*` (talk outline, pin passes,
    ui-depth) are off, so `?ui=0` is a real A/B for group scenes too (crawl with/without UI: identical 152/12/148 px).
  - `m.top` = visual top (m) and `m.head()` = feet + `m.top` + 0.1. `VISUAL_TOP_M` (exported) overrides `spec.height`
    where it is a prop: `storyteller: 1.55` (staff finial 1.91). Measured from the flag buffer at vh 12: frog 1.26–1.30,
    mushroom cap 1.34 (spec 1.36), fox ears 1.23 (spec 1.32), goat 1.42–1.50, crow 1.38: within ±3 texels of spec, so no
    other override. `m.height` stays `spec.height` (talk outline rect). `engine.stats.ui.anchors` lists each member's
    projected head / feet (screen px).
  - `hud.stack.top(m, L, kind)` — the shared above-the-name stack (v2 order label < bubble < pins < pop): the row the
    BOTTOM of a `kind` element sits on. 'label'/'bubble' = 1 px above the label (+ ghost lift + "You" chevron); 'pins' =
    also above the chat bubble (L.world scan in the head column ± 2, gaps ≤ 3 rows bridged); 'pop' and others = also
    above what sits on that (person pins, bells; scan ± 10, 1-row gaps, ≤ 30 rows). The scan sees what is drawn at a
    LOWER z (bubbles 20, bells 25, person pins 30): draw at a higher z than what you stack on. `hud.indicators.stackTop`
    is routed through `stack.top(m, L, 'pins')` (markers' person pins and events' bells now clear bubbles); the
    label-only original is `hud.indicators.labelStackTop`. Known limit: when two neighbours' stacks touch, a pop can
    land on the neighbour's bubble (a real layout overlap, not a stack error).
  - `hud.keepOut(L, {transient, groups, space})` → the HUD slot rects (`placeholders.js keepOutRects`) for world UI /
    offscreen arrows that must avoid them; `transient: true` adds the briefly shown slots (clock card, vote clock,
    moment banner, caption, joystick).
  - `hud.game` = `MOCK_GAME` (day 2, nominations, Ada nominated Cleo, Bram voting, you seat 4, Esme dead): one mock state
    for every group's mock content. `MOCK_CAST` Esme plays the rabbit's `ghost` clip (her ghost look is a clip).
  - Group modules are imported only when `src/ui/<g>/hud.js` exists (HEAD request; a 404 in the console is expected for
    groups without a module). A module that fails to import / set up / draw gets a red error tag (top left) and
    `engine.stats.ui.groups[g] = 'error (…)'`; the other groups keep rendering. `?strict=1` fails the page instead.
  - Slots (`placeholders.js SLOTS`, indices are contract, new ones appended): hud[0] role chip w 180 (was 150), hud[4]
    toasts w 150 (was 170: the column covered Bram's bubble at the game camera), hud[6] voice pill (x −32, y −4, 64×14),
    hud[7] clock card (centre, y 24, 168×40, transient: under the phase caption while one shows), hud[8] touch joystick
    (x 4, y −4, 56×56, transient), events[2] vote clock (4, 188, 69×90), events[3] moment banner (centre, y 96, 300×48,
    transient; world labels under it may be covered for its ~4 s).
  - **Mock game screen** (UI lead, 2026-10-17): `?scene=ui-hud&game=1[&tod=noon|golden|night][&moment=none]` = every group
    live at once (as the default) + a game-event FX moment on the events loop (9.6 s): the Storyteller poofs out of the
    circle centre (u 1.0), reappears in front of it (u 1.8), poofs out (u 6.4) and back (u 7.2) (`POOF_MOMENT`, events
    `poof_*` + his `appear` clip, scheduled; he is driven from stage time). `hud.st.pos` stays at the centre (vote hand
    origin); his label / pop follow `hud.st.feet()`. `game=1` also wraps every group's layer callbacks with a timer:
    `engine.stats.ui.perf.meanMs` (ms per UI frame per group). Evidence, coverage, perf and the porting map:
    `docs/UI_GALLERY.md`; packer for 1x captures: `shots/ui-gallery/pack.sh <dir> [N] [crop]` (ffmpeg GIF + MP4 + sheet).
  - `scenes/ui-hud.js` is also the hud group's scene (`?scene=ui-hud&groups=hud&state=…`, §6 hud): the group states live
    in `src/ui/hud/hud.js`; no separate `scenes/ui-hudgroup.js`.
- Your slot: `src/ui/<g>/hud.js` → `export default { z?: number, async setup?(hud), draw(hud, L) }`. When it exists the
  mock HUD calls it instead of `PLACEHOLDERS[<g>]` (a module that throws on import fails the page — on purpose).
  Stay inside your `SLOTS[<g>]` rects (`src/ui/placeholders.js`; `?slots=1` draws them); world elements anchor to the
  cast via `hud.cast` / `hud.st`. Tier W meshes go into `engine.scene` in `setup`.
- Your scene: `scenes/ui-<g>.js` = `buildHudStage(...)` + your module + whatever close-ups/state toggles you need
  (`?state=…`), day + night, with cast members. Render: `tools/shot.sh ui-<g> shots/ui-<g>/<name>.png --size 1280x720`.

### 3.4 Bake contract (`tools/uibake.sh <g>|<g>:<name> [--q k=v] [--strict]`)
`src/ui/<g>/bake.js` default export: `{ image?, width?, v2?, skip?, only?, frames(env), meta?(env, rects),
manifest?(env, {img, rects, meta, image}) }` (full comment in `scenes/ui-bake.js`). `env = { engine, kit, params, tod,
T, group }`. Frames are `[name, PixelImage]` in the order you want them packed (v2 order preferred). The tool writes
`out/ui/<g>.png` + `.json` (Mac copy = source of truth; the host only writes `shots/ui-<g>/bake/`), a labelled ×4
`shots/ui-<g>/bake/<g>-sheet.png` (look at it), and prints `coverage: n/m v2 frame names present; MISSING: …` when `v2`
names a manifest in `refs/ui/_src/` (`social.json`, `square-props.json`, `cast-portraits.json`). `--strict` fails on
missing names. Extra TEXT outputs (module fix): `files(env, {img, rects, json})` → `{basename: text}` (e.g.
`{'panels.css': css}`); uibake writes them next to the atlas, lists them in `<name>.files`, and `uibake.sh` copies them
to `out/ui/`. v2 reference manifests live in `refs/ui/_src/` (`art-ui.json` = the v2 DOM skin names, copied from
`src/ui/panels/v2-art-ui.json`: use `v2: 'art-ui.json'`). A second atlas of a group: `src/ui/<g>/<name>.bake.js`, `tools/uibake.sh <g>:<name>` → `out/ui/<name>.*`
(name it after the v2 file it replaces, e.g. `cast-portraits`). Composite drop-ins owned by the lead: `tools/uibake.sh social` (re-packs markers + emotes + portraits
frames into `out/ui/social.{png,json}` with the v2 meta), `tools/uibake.sh kit`.

### 3.5 Shots and evidence
`shots/ui-<g>/` only (fresh sub-folders per round: `r1/`, `r2/`). Helpers: `shots/ui-lead/zoom.py in out x0 y0 x1 y1 s`
and `shots/ui-lead/strip.py out x0 y0 x1 y1 s frames…` (run via `tools/remote.sh python3 …`, then rsync back). Crawl:
`tools/crawl.py` on `?pan=1,1&t=1&grass=0&grade=0&screen=0` captures.
Module fix 2026-10-17: `tools/remote.sh` now syncs `shots/*/*.{js,mjs,py,sh}` helpers (was js/py only).
`tools/uigif.sh <scene> <out-dir> <t0> <dur> [x,y,w,h] [--q …] [--size 640x360] [--scale 2]` = 1x capture at
`t0 + k/30 + 0.001` (the epsilon keeps a frame from rounding into the previous grid frame) → `<out-dir>/anim.gif` (GIF
delays 30/30/40 ms = 30 fps) + `strip.png` (numbered frames). `tools/shot.mjs` pads frame indices to max(2, digits)
(unchanged under 101 frames) and serialises `engine.stats` cycle-safe (three.js objects become `[Type]`);
`tools/sheet.py` sorts frames numerically. `tools/clean.sh` reports the number of remote files it removed.
Crawl convention (checked): `crawl.py --dx 1 --dy 1` matches `?pan=1,1` captured at consecutive 1/60 s times (expected
shift = best shift, frames 1–3); pass exactly those times, or the shifts disagree. The PIL hosts lack `Image.Quantize` /
`Image.Dither` enums: use the numeric constants.

---------------------------------------------------------------------------------------------------------------------

## 4. Groups and briefs
Each group: build → critic → refine (pipeline/07*). Deliver: `src/ui/<g>/{hud,bake}.js` (+ any modules), `scenes/ui-<g>.js`,
`out/ui/<g>.{png,json}`, 1× GIFs of every animation, day + night stills with cast members, v2 side-by-sides from
`refs/ui/<g>/`. Keep every v2 frame name; new-style additions get new names (documented in your meta `newStyle`).

**markers** (inventory 1–8; refs `refs/ui/markers/`) — the pointing finger `point_<dir>_<0..2>` (8 dirs × 3, 20×20, anchor
10,10, seq 0,1,2,1 at 7.5 fps), `ping_0..3` (28×14, anchor 14,7, 10 fps, Ag), `pin_<8 colours>` (18×26, anchor 8,25,
`pinIcon` disc 3,3 r6 for the 12×12 cast icon), `pin_shadow` (12×5), `pin_drop_0..3` (26×16, 15 fps once), plus new:
`pin_remove` (badge), `trail_*` (dotted trail dots), `pick_0..n` (ST crosshair). Pins: pixel3d pins should feel like
small lit objects (3-tone + line, cream rim top-left); consider a tier-W 3D pin for place pins (with `pin_<c>` still
baked for the 2D drop-in). Atlas `out/ui/markers.{png,json}` (`v2: 'social.json'`, `only: n => /^(pin|point|ping)/.test(n)`).

**emotes** (9–12) — `emote_point` (14×14) + the radial pie menu (ring, wedges normal/hot/disabled, hub, dead zone, caption
tooltip, Remove wedge, touch size 104 vs mouse 84 CSS px → in texels at ×2/×3) and the social dock (Point/Pin toggles,
8 swatches + selected, Clear my pins, key hints, armed state, dock portrait button frame), open/close animation (2-frame
pop, wedges stepping in), in-world emote pop above a character (new: `emote_pop_*`). Leave out the nick face. Atlas
`out/ui/emotes.{png,json}` (`v2: 'social.json'`, `only: n => n === 'emote_point'`).

**indicators** (13–21) — name labels (player / Storyteller gold / ghost / you), the speaking indicator (silhouette outline
in the new style — note the cast `talk` clip already emits a small "…" FX bubble: coordinate, don't double up — and the
3-bar glyph, self "on air" variant, muted), speech bubbles (9-slice + tail, stacking, wrap rules from v2 `SPEECH`), the
"You" marker, guidance arrow + door ring (Ag), home compass pill (S), house-name callouts, door-board occupant tokens
(`icon_<castId>` in a pinned disc, ghost variant, "+N"), offscreen-player arrows (new). Atlas `out/ui/indicators.*`.

**portraits** (23–25) — rendered from the 3D characters (`characters/*`, skip `nicksong`; `brianbi` absent): one portrait
camera/framing/light for all, `icon_<castId>` 12×12 (31 ids: v2 `meta.icons` minus nicksong, brianbi; `meta.headCrops`
semantics: face centre), `cast-portraits` cells 32×40 (`down`: idle + walk1..4 for players, 1 frame for storyteller +
NPCs, `<id>/ghost` + `<id>/ghost-spent`) in the v2 manifest shape (`manifest()` → `{image, frameWidth, frameHeight, dir,
sheets}`), 24×24 dock/notebook avatars (new), role plaques 32×32 (optional, TB roles). Atlases `out/ui/portraits.*`
(icons, `v2: 'social.json'`, `only: n => n.startsWith('icon_')`) and `out/ui/cast-portraits.{png,json}` (`v2:
'cast-portraits.json'`): a second atlas module `src/ui/portraits/cast-portraits.bake.js`, baked with
`tools/uibake.sh portraits:cast-portraits` → `out/ui/cast-portraits.{png,json}`.

**hud** (22, 26–38) — role/status chip, role card, clock chip + mini dial (stage colours, urgent, paused), vote card,
ST clock control, tower clock hands (tier W/A over the town's clock face — the town owns the tower; draw hands only),
toolbar + phase chip (sun/moon/game-over icons), toasts (death/error/game over), context hint pill + door prompts,
countdowns, voice presence chips, touch joystick, connection banner, and the **display font** (§2.4) + font atlas
(`out/ui/hud-font.{png,json}` in the kit glyph format). Atlas `out/ui/hud.*`.

**panels** (39–49) — the panel kit as a skin the existing DOM can adopt: baked 9-slices for panel/raised/hover/pressed/
disabled/primary/sunk/parchment/tooltip/chip/danger (from `FRAMES` → refine into art), tabs, inputs, select chevron,
checkbox/radio/switch, slider track + knob, scrollbar, dividers, parchment pamphlet, badges (You/Host/Not ready/ST/
alive/dead), list rows with portrait slot, modal scrim, cursors, and the 16×16 UI glyph set `glyph_<name>` (✎ ☽ ☼ ◎ ♫
☾ ✷ ⚑ ↶ ⇆ ⌂ ⚙ ? ⇦ ✓ ✗ ★ ghost hand scale scroll mic speaker mute lock bell…). Mock screens: lobby/waiting room, notebook,
storyteller panel, endgame reveal, settings. Plus a CSS export (`out/ui/panels.css`: `border-image` rules at `--px`
integer scale). Atlas `out/ui/panels.*`.

**events** (50–59) — seat markers (normal / you / dead wisp / nominee / numbered ST view; tier W or Ag), vote clock hand +
voter pulse + nominee ring, raised/locked hands (hand-raise reveal), the HUD vote clock + tally, phase captions,
night-falling / dawn transition overlay (banded, full screen, `NIGHT` 650+1600 ms, dawn 900 ms), execution / night
death moment (non-graphic, cozy-gothic: a toll, a dim, the ghost rising), ghost reveal + halo while the vote is unspent,
Storyteller poof `poof_0..5` (32×40, anchor 16,38, 15 fps, v2 name from `square-props.json`) + appear/vanish, game
start / end banners. Atlas `out/ui/events.{png,json}` (`v2: 'square-props.json'`, `only: n => /^(poof_|glow_)/.test(n)`
for `poof_*`, `glow_warm`, `glow_cool`).

---------------------------------------------------------------------------------------------------------------------

## 5. Porting notes (for the eventual Clocktower integration; notes only — never edit pipgws)
- **Atlases**: `out/ui/social.{png,json}` replaces `packages/assets/generated/social.*` (same frame names, anchors, fps,
  `meta.icons/pinColors/pinColorHex/pinIcon/point/place`; `nick_face` and `icon_nicksong` absent by user decision (and
  `icon_brianbi`: no character) — check how `game/social/art.ts` / `nickFace.ts` behave per missing frame before dropping in). `out/ui/cast-portraits.*`
  replaces `generated/cast-portraits.*` (`ui/common/castPortrait.ts` reads `sheets[<key>]`). `out/ui/events.json`
  `poof_*` drop into `square-props` (the client builds `fx#poof` from the manifest `meta.fps.poof`; ship 15 so the grid holds stay 2).
- **Scale**: the v2 town renders at a CSS zoom; new-style art is texel-exact — draw it at an integer zoom with
  `pixelArt: true` / `roundPixels: true` (Phaser) so a texel stays a square of whole device pixels.
- **Portrait walk cadence**: v2 `ui/common/castPortrait.ts` steps WALK [1,2,3,4] every 140 ms and ignores the manifest;
  the new cast-portraits walk is one game-speed cycle at 15 fps: step at 67 ms or read `meta.walkStepMs` / `walkFps`
  (`out/ui/cast-portraits.json`). Preview: `scenes/ui-portraits ?walk=v2`.
- **Ghost look per species**: some ghosts are a CLIP (rabbit's halo is a key of its `ghost` clip, it ignores
  `Character.ghost` / `rig.setGhost`); switch clips (`play('ghost' | 'ghost-spent', {at})`) to be safe.
- **Text**: Phaser labels/bubbles switch from `Text` (Alegreya Sans) to BitmapText built from `out/ui/kit.json
  meta.bitmapFont` (body/tiny) and the hud display font; DOM text may keep the vector fonts (accessibility, i18n) while
  adopting the panel skin, or use the bitmap fonts for headings only.
- **DOM skin**: `border-image: url(panels.png) 3 3 4 3 fill / calc(3px*var(--px)) …; image-rendering: pixelated` with
  `--px` = the integer UI scale; tokens map 1:1 onto `theme.css` variables (§2.7 table).

- **Notebook (notebook group)**: `out/ui/notebook{,-night}.{png,json}` + `out/ui/notebook.css`. (1) Notes page: keep the v2
  `<textarea class="ctn-text">` native (IME, a11y, undo). Load `notebook.css` after theme.css/panels.css: page plate as
  `border-image` (no `fill`, `repeat space`), parchment + `notes-rule` background with `background-attachment: local`,
  `line-height` = 10 px x `--px` so each line sits on a rule, caret / `::selection` / `::placeholder` / scrollbar in page
  tokens. **The binding holes are fixed to the page frame; only the rules and the text scroll** (the mock page does the
  same since r6). **Height is snapped**: border box = (8 + 10 x `--ctn-rows`) texels (default 14 rows, `resize: none`),
  so the left edge always tiles whole holes (the 9-slice middle = one 10-texel hole period). Never give `.ctn-text` a free
  height; to fill a flexible box, set `--ctn-rows` from a ResizeObserver: `rows = floor((cssH / px - 8) / 10)`.
  **Font**: by default the DOM text keeps the v2 vector font at 7 px x `--px` (`shots/ui-notebook/r6/dom-css.png` tile 1),
  which differs from the mock page (pixel body font). For the game-style look add `.ctn-pixelfont` to `.ctn`: notebook.css
  carries `@font-face 'CT Pixel Body'`, a TrueType face generated from the kit body bitmap font
  (`src/ui/notebook/ttf.js`, 1 glyph px = `--px` CSS px at 8 px x `--px`), with `var(--font)` as the fallback, so
  accents, CJK / IME input and emoji fall back per glyph to the vector font (tiles 2-5, 3 = `--px` 3). Verified in
  headless Chromium with the real CSS (`shots/ui-notebook/domshot.mjs`; Playwright hides scrollbars, so the scrollbar
  skin is unverified there). notebook.css is now a bake `files()` output (no `meta.cssText` / mkcss.py step). Move the textarea out of `.ctn-body` into a 2nd page behind a `role="tablist"` (`.ctn-tab-seats`,
  `.ctn-tab-notes`, `aria-selected`). The Notes tab names the page, so `.ctn-page-label` is hidden. (2) Reading book:
  **protocol change for the lead**. Add a per-player `notebook: 'closed'|'open'|'writing'` presence flag. The client sets
  it on drawer open/close, and sets 'writing' while an input event happened in the last 1.5 s (rate-limit to state
  changes). The server forwards it ONLY to players who can see that avatar (same scope as positions / zone chat). It
  reveals THAT someone is reading, never WHAT: no notebook data travels. The Storyteller's scratchpad counts too (its
  owner decides; it may be suppressed for the ST). Each viewer keeps `openAt` / `closeAt` per pid on its own clock
  and runs `bookState()` (src/ui/notebook/draw.js): open 8 grid frames (15 fps), hold `meta.holdSeq` at 10 fps (seeded
  per pid so readers never flutter in sync), write 10 fps, close 6 grid frames, dir from the avatar facing.
  Placement: grip = feet + 0.42 x height + 0.24 m along facing; facing the camera (down, down-left, down-right) 0.36 x
  height so the top of the face shows above the spread (owl 0.30); facing away 0.32 x height, 0.27 m to the right.
  Phaser: depth = avatar depth + epsilon (never hidden by its own reader, including a wide hat / cap above the book),
  under name labels / bubbles / the point finger. Reduced motion: no open/close drawings, no flutter.
---------------------------------------------------------------------------------------------------------------------

## 6. Learnings (append-only; groups add dated bullets)
- 2026-10-17 lead: the world UI layer composited after grade (order 300) keeps UI colours exact (no grade tint) and rides
  the sub-texel camera offset: a whole-texel pan adds 0 crawl px (`shots/ui-lead/r3/`).
- 2026-10-17 lead: anything that touches the ground must go to `L.ground` (or tier W): on `L.world` a ping ring at a
  character's feet draws over the character's body (`shots/ui-lead/r3/strip-cleo.png` vs `r4/zoom-cleo.png`).
- 2026-10-17 lead: the cast `talk` clip shows its own small "…" FX bubble over the head — indicators must place the chat
  bubble above it or agree on one of the two.
- 2026-10-17 lead: the left panel slot covers seat 7's label at the game camera; keep side panels ≤ 132 px wide and let
  world UI near the edges clamp inward (offscreen arrows).
- 2026-10-17 markers: the token `parchmentLine` (#7C6546) has the same value as the noon cobbles, so a glove outlined in it
  disappeared there. The finger uses `ramp(parchment, {line: .44}).line` instead (still its own darker, cooler shade):
  `shots/ui-markers/r3/z-rose.png`. A 1-px gold ring on light cobbles needs a goldLine ring just outside it, as v2's dark
  under-stroke did (`r3/z-left.png`).
- 2026-10-17 markers: shade a rotated or flipped template AFTER the transform (auto-shading from empty neighbours on the
  up/left vs down/right sides). Then all 8 finger directions keep the upper-left light (`shots/ui-markers/bake/markers-sheet.png`).
  Clamp each jab frame inside the 20×20 so the fingertip never clips: the right-hand template is 13 px wide, so a 2-px jab fits.
- 2026-10-17 markers: person pins stack on `hud.indicators.stackTop(m, L)`, which covers the ghost lift and the "You" chevron.
  It does NOT cover the chat bubble yet, so a fan of pins on someone who is talking covers the bubble (`r2/z-bram.png`).
  v2 also drew pins at a fixed height over the bubble.
- 2026-10-17 markers: grid-time recipes. Drop = v2's curve sampled per 15 fps drawing (lands on drawing 5, sparkle drawings 5–8).
  Removal = POP_MS 170 → 5 grid frames, Bayer dissolve with holds 2/2/1. Point = pop for 2 frames, then a dissolve over the
  last 6 grid frames of EMOTE_POINT_MS. 1× GIFs: `shots/ui-markers/gifs/` (GIF delays 30/30/40 ms average exactly 30 fps).
- 2026-10-17 indicators: the talking silhouette outline needs no per-character masks: a low-res pass at order 290
  (`src/ui/indicators/talkOutline.js`) rings non-character texels whose 4-neighbour is a FLAG_CHAR texel at the
  talker's depth ±0.9 m, inside the talker's screen rect (width = 1.0 × body height: hats, staffs and tails stick out
  further than 0.75). After grade/vignette, so the talk/self tokens land exactly; texels nearer than the talker are
  skipped (v2 'behind' mode). Crawl check with talkers on: 0 UI-side px (`shots/ui-indicators/r3/crawl/`).
- 2026-10-17 indicators: ground decals (tier Ag) that point UP-screen from a character sit behind its body and vanish
  (the guidance arrow at 0.85 m toward a door straight up the screen was invisible); step them sideways beside the feet.
- 2026-10-17 indicators: `kit` `ring()` with two concentric ellipses leaves 1-px spurs at the poles; an annulus (inside
  outer, outside inner; 2 px wide at the sides, 1 at the poles) + `shade()` (hi top-left / sh bottom-right + line)
  reads as a clean lit ring (`art.js annulus`).
- 2026-10-17 indicators: chat bubble above the label, the cast `talk` clip's "…" FX bubble sits beside the head BELOW the
  label: no collision at vh 12, so both stay (the "…" = mouth moving, the 3-bar glyph + outline = voice). Groups that
  stack above names: `hud.indicators.labelTop(m, L)` / `stackTop(m, L)` (set in setup).
- 2026-10-17 portraits: portraits/icons/avatars are RENDERED from `characters/*` inside the bake page
  (`src/ui/portraits/render.js`: key background `#00FF00`, one grid render per variant, canvas readback 1 sample per
  texel — 0 non-uniform blocks measured). Two traps: `createActor`'s `ch.play()` is stamped with the ENGINE time, so a
  batch on its own clock must replay loop clips with `play(clip, {at: 0})` (else ghost clips never show); LegGait plans
  (frog, fox, owl, goat, toad, honk, …) do not step on a pinned treadmill root and many specs have no `clips.walk` —
  walk them for real (`move: true`) and crop around the root's ground point each sample.
- 2026-10-17 portraits: at 12 px the cast's 2x2 eyes vanish when a whole head is fitted into the disc, and an eye-bone
  centred face crop at the design scale (34 texels/m) gives flat colour discs for the frog family (eye bones sit on the
  bumps). What reads: fit the `@head` mark box slightly OVER the disc (head 13 px), centre at 72 % of the box height,
  plus 2 per-id overrides (frog 16 texels/m, rabbit 22) — `shots/ui-portraits/r1/icons-vs-v2.png`. Pale ghost / dead
  busts need a deeper backdrop than alive ones (`ICON_STYLE_DIM`).
- 2026-10-17 portraits: the die clip's lying pose overflows a 32x40 cell by 10–12 px (green-hood, honk, polly, chonk) —
  `<id>/dead` is the idle portrait in a memorial tone instead. Portrait scale 26 texels/m keeps every alive cell inside
  32x40 except chonk (±7 px wide), maxflow (2 px, tail) and storyteller (±2 px, lantern + staff): re-centred per key, clipped.
- 2026-10-17 indicators r2: a pale 1-px silhouette outline (talk #FFE7A3) vanishes on noon cobbles at 1x. A second 1-px
  ring one texel further out, in a dark own-family line (talk: `goldLine`; self: `ramp(danger).line`), fixes it with
  no change at night. In the post pass this is "a non-character texel whose 4-neighbour is a ring-1 texel"
  (`talkOutline.js`, 4×5 flag taps). Evidence: `shots/ui-indicators/r4/z-hud-noon.png` vs critic `r1/z-gus-noon.png`.
- 2026-10-17 indicators r2: `spec.height` is not always the head. The Storyteller's H 1.91 is the staff finial and the
  hood tip is about 1.55, so labels floated 15 texels high. `hud.js VISUAL_TOP_M` holds per-id visual tops, and
  `labelTop()` / `stackTop()` follow it. The lead's `buildHudStage` `m.head()` still uses `spec.height`.
- 2026-10-17 indicators r2: ground decals at the gameplay camera should be authored as screen-space bitmaps (right,
  down, down-right, plus exact flips, shaded after the flip), not as rotated and foreshortened polygons. A 13-px
  polygon arrow in 16 headings rasterised into mushy blobs. Add a marching dot trail along the screen heading so the
  direction still reads after the decal steps sideways out from behind the body (`r4/z-guide.png`, `r4/z-door.png`).
- 2026-10-17 indicators r2: a ground ripple under a character must avoid the body footprint. Draw only the front ~60 %
  of each ellipse (`y ≥ cy − 0.3·ry`), with rx ≥ body width + 6 (`r4/z-talk-noon.png`).
- 2026-10-17 indicators r2: v2 stacked bubbles lose their tail, which makes attribution ambiguous. A lifted bubble
  should keep its tail and add a 1-px dotted connector (a bubbleEdge dot with an outline pixel beside it, on even
  rows), drawn under all bubbles. When a lift changes, show 1 halfway drawing for 2 grid frames instead of a hard
  snap. The kit `envelope()` dissolves in 200 ms, so this group uses its own 600 ms (v2 fadeOutMs) with 6-frame holds
  (`r4/anim/s-out2.png`, `s-in.png`).
- 2026-10-17 indicators r2: the portraits group's `icon_rabbit/ghost` is nearly uniform pale blue at 12 px. Door
  tokens now contrast-stretch ghost icons over the 4 ghost tones. When that still leaves under 5 % feature texels,
  they draw the dimmed initial (`r4/z-board.png`).
- 2026-10-17 portraits r2: a "walk in place" sampled from the real gait twists, it does not step: the bird WADDLE yaws the
  hips toward the stance foot (`roll` x 0.6) and rolls the body, the biped gait twists pelvis/chest (`twist`), and at
  32x40 that reads as the figure turning 20-45° (honk, owl, crow). Facing itself never changed (the drive returns face 0).
  The portrait walk zeroes them per render (`renderCast({loco})` merges into `spec.locomotion`: `WALK_LOCO` = twist /
  roll / headBob / flex 0, hop 0.03 m), then puts each drawing's feet on the idle ground row and clamps the head x to
  ±1 px of idle (`shots/ui-portraits/probe/walk-def.png` vs `walk-flat.png`, `r2/z-walk-frames.png`). The fox's
  remaining "turn" is its tail (the gait's armL channel) swinging behind the head — intended. Hop plans (frog, toad,
  rabbit) keep a crouch drawing: their walk IS a hop.
- 2026-10-17 portraits r2: variant icons must be made from the ALIVE bust, not from a re-render of the pale ghost shell:
  the shell has no value contrast left, so at 12 px every ghost/spent/dead icon was a blank disc. `style.toneShift`
  keeps each texel's own lightness order (stretched onto a per-variant band: ghost L .40-.95, spent .24-.74, dead
  .30-.90) and only borrows the variant ramp's chroma, so eyes stay dark against the face. A plain quantise onto 5
  ramp steps by percentile (r2 first try) still lost green-on-cream faces (toad, progress): hue had carried them.
  Non-colour cues at 12 px: ghost = gold halo arc replacing the ring's top row, dead = ring notch + 1-px crack upper
  right; variant rings use a light ramp step so the disc reads on night cobbles (`r2/z-world-night-*.png`).
- 2026-10-17 portraits r2: one ghost family for the cells: the per-character ghost clips are kept (their pose/shell) but
  re-toned per image onto one 5-step ramp (`toneRemap`, percentile-normalised), their 3D halos flood-erased (gold
  seeds at/above the body top, so kept-gold eyes survive) and replaced by ONE 2D halo (7x3, gold tokens, stamped AFTER
  the rim line — ringed, its hole filled with line colour and it read as a barrel), solid bottom on row 36 (dither
  fringe ignored). `outlineOwn` now skips single-texel islands (no more speckled ghost hems). Tall figures (cilantro)
  have no room above the head: the halo overlaps the top 3 rows.
- 2026-10-17 portraits r2: the v2 picker (`castPortrait.ts`) steps WALK [1,2,3,4] every 140 ms and ignores the manifest:
  a game-speed 4-drawing cycle (15 fps) plays there at half speed. The manifest says so (`walkStepMsV2 140`, `walkStepMs
  67`); `?walk=v2` previews that cadence (4 grid frames = 7.5 fps): `r2/walk-v2-140ms.gif` vs `r2/walk-15fps.gif`.
  Capturing with `--times` rounded to 4 decimals put a 3-frame hold in the strip (1.1333 x 30 = 33.999): pass exact
  grid times when checking holds.
- 2026-10-17 emotes: capture times come back rounded (`--times` 4 decimals): `floor((t - t0)·30 + 1e-6)` turns a 1-frame
  pop into 2 frames (0.8333 − 0.8 = 0.9999 frames). Index with a 0.01-frame tolerance (`gridK` in `src/ui/emotes/art.js`)
  or compute timelines in whole grid frames (`shots/ui-emotes/gif/strip-open.png` before/after).
- 2026-10-17 emotes: the tiny font's `M` (`101/111/111/101/101`) reads as `H` ("RMB" → "RHB"); the dock key chips spell
  mouse buttons RIGHT / LEFT instead. A 5-wide M (or a body-font chip) would fix it for everyone.
- 2026-10-17 emotes: a 9×9 up-right glove reads as a blob; at 7 px of art the index finger must be a single 1-px row
  pointing straight (`emote_point_9`). The 14×14 v2 diagonal silhouette works at its own size.
- 2026-10-17 emotes: pie wedges = per-pixel annular sectors with a ≥ 0.8 px perpendicular gap; the hot wedge pops out
  2 px over the back ring and its icon moves 1 px out, so hot reads without colour. Pie images are memoised (state key):
  per-pixel atan2 for 9 wedges was ~0.7 M calls a frame otherwise.
- 2026-10-17 emotes: world pops, person pins (markers) and chat bubbles (indicators) all stack "above the label" with no
  shared stack top: a pop drawn at label top − 1 overlaps a person pin (`shots/ui-emotes/r5/hud-night.png`, Finn). Showcase
  pops sit on members without pins until a shared stack helper exists.
- 2026-10-17 markers r2: depth-tested place pins without a mesh (`src/ui/markers/pinPass.js`). The pins are painted into
  their own padded low-res image, with a per-texel R32F view depth (the spot's depth, since a pin stands upright).
  A pass at order **301** composites them: after `ui-world`, so L.ground decals such as the "you" seat ring stay under
  the upright pin; masked by L.world alpha (a second DataTexture over `L.world.data`), so labels, bubbles and the finger
  stay on top; the scene texel is kept where `linDepth < pinDepth − 0.25 m`. The first try at order 299 (before the UI
  layer) let the seat ring print over a pin. Pin shadow and drop sparkle go through the same pass at depth + 0.02.
  Evidence: `shots/ui-markers/r5/depth-noon.png` and `z-depth-*.png`, and the drop behind Finn in
  `g-depth/s-drop-depth.png`. Known gap: the indicators talk outline (290) is under the pins, so a pin behind a
  talker breaks the ring along the pin edge.
- 2026-10-17 markers r2: one scene function drawn in phases ('pins' pass / 'trail' z 15 / 'main' z 30, via
  `M.register`). This keeps the trail below the indicators' bubbles and labels (z 20) without duplicating the scene
  logic. The phase view is `Object.assign(Object.create(L), {phase})`, and L's getters still work through the prototype.
- 2026-10-17 markers r2: an icon in a same-colour pin melts into it (teal frog in a teal pin). Draw icons on the
  disc's inner part only (4-neighbour interior) and keep a 1-px socket ring: shadow on the upper left, lit on the
  lower right. Kit `PIN_RAMPS.black` has a LIGHT line, which reads as a grey hollow ring, so the markers art overrides
  it with a dark body. A glove on cobbles of its own value needs a line near labelLine value
  (`ramp(parchment,{line:.58})`) plus a darker shade band. Thin gold specks need a goldLine ring to read on noon grass.
- 2026-10-17 emotes (r3): a dark pin on a dark panel reads hollow if its OUTLINE is the light tone; make the body solid
  (black ramp hi + iron-hi lit rim) inside the dark UI outline instead (`shots/ui-emotes/bake/z-glyphs.png`, black pin / dot).
- 2026-10-17 emotes (r3): a 9–11 px pointing hand reads as a hand only with flat crease rows (parchment-sh) between the
  finger and the curled fingers; a solid fist + finger block reads as a flag / mitten (`emote_point_9`, `emote_point_11`).
- 2026-10-17 emotes (r3): never put text labels inside 46-texel pie wedges (they overflowed into the hub and neighbours);
  v2 draws none, the caption plate names the hot wedge. Commit steps: drop the hub well with the dissolving wedges,
  otherwise a lone near-black hub disc blinks as a hole (`shots/ui-emotes/r7/anim/s-commit2.png`).
- 2026-10-17 emotes (r3): don't put the hud slot's own state object into `engine.stats` if it may hold three.js objects
  (markers context): `shot.mjs` prints stats as JSON and fails with "property 'parent' closes the circle".
- 2026-10-17 panels: the v2 DOM skin has real frame names — `apps/client/public/art/ui/<name>.png` (panel, panel-parchment,
  button, button-hover, button-primary, divider + 16 icons). `out/ui/panels.json` keeps all 22 (`uibake --strict` against
  `src/ui/panels/v2-art-ui.json`, reached through the bake page's `refs/ui/_src/../../../` path). The new `panel` keeps
  v2's slice 8 (iron corner brackets fill exactly the 8-px corner), so the v2 rule `8 fill / 8px` only changes scale.
- 2026-10-17 panels: CSS `border-image` cannot crop an atlas rect, so `out/ui/panels.css` inlines every frame as a data
  URI (80 KB, self-contained). A select's chevron must NOT sit in a 9-slice edge (it tiled 3x on a tall select): frame
  without `fill` + inkSunk background colour + a positioned chevron (`shots/ui-panels/r1/css-demo.png`). Theme scopes
  such as `.ct-waiting button:not(...)` out-specify `.ct-switch`, so list skinned non-buttons in the `:not()`.
- 2026-10-17 panels: iron (#5E566C) glyphs on ink panels read as holes at 16 px; free-standing glyphs use a `steel`
  ramp (`ramp(ironHi)`), frames keep iron. Off-state marks recoloured with their outline became blobs: render the
  mask again in steel WITHOUT an outline (`toggle_<n>-off`).
- 2026-10-17 panels: auto-shading a mask by exposure (top/left open -> hi, bottom/right open -> sh, both -> mid) works
  for every glyph and for brackets mirrored to all 4 corners (shade after placement), and keeps 1-px strokes at mid.
- 2026-10-17 panels: timelines driven by `t % cycle` lost a pop frame to capture-time rounding; drive them by whole
  grid frames (`floor(t*30 + 0.01) % N`): `shots/ui-panels/r2/strip-modal.png` shows the 2-frame pop + 3-step dissolve.
- 2026-10-17 events: anything stacked ABOVE a name label collides with chat bubbles (indicators' `stackTop` excludes
  them): the r1 raised hand covered Bram's bubble text (`shots/ui-events/r1/z-hud-bram.png`). Hands now sit BESIDE the
  label, as v2 drew them beside the head (`draw.js handSpot`: right, or left when the talk glyph is on the right):
  `shots/ui-events/r2/hud-night.png`. A shared stack helper that includes bubbles would let pins, pops and bells agree.
- 2026-10-17 events: a full-world Bayer dim (6/16, then 4/16 of the night shadow) reads as a screen door over the
  square at 1x (`shots/ui-events/gifs/s-exec2-a.png`). The execution hush uses the `scrim` token at 3 stepped
  strengths, with the hole rim banded at half strength (`gifs/s-exec3.png`). Full-screen transitions that MOVE
  (the night veil falling in 4 dither levels behind a 72-px leading band, `gifs/s-night-a.png`) carry dither well,
  because the eye follows the edge.
- 2026-10-17 events: a dawn wash made of 3 full-width colour stripes looks like a filter (`gifs/s-dawn-c.png`). Light from
  the horizon (gold / rose / violet bands from the top edge, the far side at this camera, alpha a, 2a/3, a/3) reads as
  sunrise (`gifs/s-dawn2.png`).
- 2026-10-17 events: swapping the time-of-day while a full-screen veil covers the frame works at runtime:
  `applyTimeOfDay` only sets uniforms, + `L.setTod` (scenes/ui-events.js `swapTod`). Lantern meshes and lights keep the
  preset they were built with. Death moments without a clip switch: a second actor of the member (its `ghost` clip),
  then toggle `actor.root.visible` from the stage clock in `engine.onUpdate`. `actor.st.at` / `actor.st.base` are live,
  so the die / appear timing and Storyteller teleports are scriptable. To hide a name label while a member is hidden,
  move `m.pos.y` above the view (indicators skips members whose feet project above the frame).
- 2026-10-17 events: tiny procedural motifs need a silhouette check at 1x. A stepped triangle bell read as a tree, a disc
  with a tip read as a gem, and the poof light column topped by a plus-star read as a sword hilt. Fixes: dome + straight
  waist + flared lip (bell), a round head with a downward curling tail + 2 eye texels (wisp), a beam that breaks into
  dashes at the top with its sparks beside it (`shots/ui-events/bake/events-sheet.png`).
- 2026-10-17 hud: the display face (`src/ui/hud/font.js DISPLAY`, atlas `out/ui/hud-font.*`) reads as a serif at 9 rows only
  with 2-px main stems + 1-px hairlines/serifs (thick/thin contrast); lower case = 7-row SMALL CAPITALS on the same
  baseline, figures bold 7-row lining (timers). In a 13-tall chip, use small caps only (`role.toLowerCase()`): a cap-9
  initial fills the interior edge to edge (`shots/ui-hud/r1/z-tl.png`). `LABEL` = kit tiny + 5-wide M/W, 4-wide N (fixes
  "NOHINATIONS"), derived from `FONTS.tiny` at import; `—`, `·` added there.
- 2026-10-17 hud: `kit.frameAt`/a clamped grid index (`Math.max(0, t)`) is wrong for event ages: an element scheduled in
  the future gets age 0 = its pop frame, so every queued toast/hint showed as a half-stippled ghost
  (`shots/ui-hud/gif/strip-anim-toasts.png` before/after). Ages need a SIGNED index (`art.sgf`).
- 2026-10-17 hud: the mini dial as a brass medallion set into the chip's left end (chip box starts at the dial centre)
  needs a 1-px goldLine inner lip between bezel and face, else a full gold wedge + gold bezel read as one coin and the
  hand vanishes (`shots/ui-hud/r1/z-tc.png` vs `bake/hud-sheet.png`).
- 2026-10-17 hud: tower clock (tier W, `src/ui/hud/tower.js`): a mesh 6 mm in front of the town's ivory dial is hidden
  (the glowing glass face wins the depth test, even a MeshBasicMaterial debug wedge was invisible); at face + 8.8 cm it
  shows, behind the game hand. Binary "50 %" = Bayer discard on the low-res grid, but `gl_FragCoord` alone is
  screen-anchored and flips under a whole-texel pan: add the camera's whole-texel position (`round(target·right / texel)`,
  set in `onBeforeRender`, not `onUpdate`, so it sees this frame's pan). Crawl: 0 px on the dial
  (`shots/ui-hud/crawl/diff.png`; the magenta arcs are the screen-anchored vignette of the town grade). Gold at half
  stipple on ivory is too close in value: the tower uses goldSh for discussion.
- 2026-10-17 hud: the role chip slot (150) cannot hold v2's "ROLE · ⌂ House · badge" for long roles ("Undertaker" +
  "Ravenscroft" = 168 px): the house name gives way with an ellipsis (`drawRoleChip({maxW})`). The toasts slot (right,
  y 38) covers chat bubbles of seats 2–3 at the game camera (`shots/ui-hud/r4/hud-tod-noon.png`, Bram) — screen tier
  over world, as in v2, but the slot sits where bubbles stack.
- 2026-10-17 hud: `scenes/ui-hud.js` is both the lead's mock HUD and the hud group's `scenes/ui-<g>.js`: the group states
  live in the slot module (`?scene=ui-hud&groups=hud&state=showcase|anim|clock|vote|st|card|dead|toasts|hints|voice|touch|conn|tower`).
- 2026-10-17 panels r3: titles now use the hud `DISPLAY` face and every small-caps label the hud `LABEL` face, both
  imported from `src/ui/hud/font.js` (the kit tiny M/W read as H: MONK -> HONK in the ST grid). A cap-9 title beside
  body text needs the body line on the display BASELINE (body y = title y + 3), and a display line with a comma has a
  2-px descender, so the next body line moves down 1 (`shots/ui-panels/r3/lobby-noon.png`). On parchment the title
  must be the biggest and darkest line (display in the team's dark tone, no shadow), or the hierarchy inverts
  (`r3/z-endgame-top.png`).
- 2026-10-17 panels r3: a 9-slice centre tile must be seamless. Auto-shading a mask by exposure gives the end
  columns of a rolled cap a different tone, and the tile repeats them as a dash every 40 texels. Copy one interior
  column across the whole centre after rendering (`art.js roll`, `r3/z-endgame-top.png`).
- 2026-10-17 panels r3: a "pop" drawing is the target state one step smaller (`checkbox-pop`: on, 3x3 tick), never
  another state's drawing (r1 flashed `checkbox-mixed`). Let the scripted cursor click the LABEL, so the box stays
  visible in strips (`r3/strip-demo-check.png`, f85-86 pop, f87 on).
- 2026-10-17 panels r3: stepper and chip labels get a hard width assert (`textWidth(label, LABEL) <= w - 6`, throws):
  GATHER (23 texels) overflowed a 27-wide step and touched the gold edge; steps are now 29 wide (`r3/z-stepper.png`).
  Role names in dense grids go in the body font (v2 normal text), dead = sunk row + ghost-vote glyph.
- 2026-10-17 panels r3: off-state marks on a raised segment need the textDim value (flat, no outline); steel on
  inkRaised disappears at 1x (`r3/z-nb-marks.png`). CSS skins of `select` need `appearance: none` (+ -webkit/-moz)
  or Chromium paints its anti-aliased arrow over the baked chevron (`r3/z-css-select.png`). Never `erase()` corners
  on the screen layer to round a dot: it punches a hole through the panel to the 3D scene; draw the corners empty.
- 2026-10-17 events r3: smoke built from discs reads as "stones" when every disc is shaded on its own (each disc's sh
  crescent becomes a dark seam inside the cloud). Paint the puffs back to front with only a light crescent (hi, 2 px) on
  each puff's upper left, put the cream rim and the sh band on the OUTER silhouette only, and break the cloud into
  2-3-puff cloudlets (never single balls) as it thins (`src/ui/events/art.js cloud()`, `shots/ui-events/r3/poof-z.png`).
  A cover effect must be as tall as what it hides at the frame the hide happens (poof_1 / poof_3 ~34 texels for the
  Storyteller, `r3/poof.png`, `r3/poof-b.png`).
- 2026-10-17 events r3: visibility toggled at "t < hideT" with float times flickers a frame at exactly the boundary in
  capture runs; compare grid frames (`gridK(t - t0) < n`) for every show/hide tied to a sprite timeline.
- 2026-10-17 events r3: Character.play(name, {at}) is scheduled and re-simulated, so a timeline-driven clip change
  (ghost -> ghost-spent when the ghost vote is counted) belongs at setup with exact times (`draw.js scheduleGhostSpent`),
  not in a draw function (the pose would lag one frame and a single still capture misses it). A play whose `at` is
  earlier than the actor's own creation play sorts before it and loses: clamp to creation time + epsilon. Per-species
  ghosts (rabbit's halo is a clip key, not spec.ghost) ignore `ch.ghost`; the clip is the reliable switch.
- 2026-10-17 events r3: a full-screen light/dark wash reads as light when it MOVES as a shape: an irregular leading
  edge (column wobble in whole 2-px steps) dithered over 18 px (dawn) or 72 px (night veil), both ways in and out. A
  uniform Bayer coverage step over the whole frame is a screen door. Washes that must not tint text go into L.world at
  a z below the labels and only fill empty texels (`drawDawn`, scene z 2); screen-tier HUD (pills, chips, captions)
  goes above any veil (veil at z 1 on L.screen): one rule for every HUD element.
- 2026-10-17 events r3: a ground plaque in front of a character needs ~0.9 m toward the camera (13 texels at vh 12) to
  clear the feet; rings around a voter go on the seat spot (feet), not between seat and plaque, and the digits are
  redrawn after the rings (`r3/z-seats.png`). A 3-px gold shaft with an 11-px arrowhead reads as a spear; 1 px + a 1-px
  shadow side + a 5x5 tip reads as a clock hand, and the night set uses goldSh for it (`r3/all-night.png`).

- 2026-10-17 hud r5: the closed role chip had a house sub-pill (keyline + padding) that cost ~10 px, so the house name was
  cut first ("Raven…"). The house is the player's way home, so it is now the LAST thing to give way
  (`art.roleChipLayout`). The order: display role + bare ⌂ house (1-px ironSh divider, no pill), then the role in LABEL
  caps with the full house, then the house with an ellipsis, all within `ROLE_CHIP_MAX` 180 (CONTRACT-REQUEST: slot 0
  150 -> 180, and x 4..184 is free because the clock chip starts at x >= 220). Evidence: `shots/ui-hud/r5/z-roles.png`.
- 2026-10-17 hud r5: a 15-px medallion cannot use the bezel's tone for its fill. A full gold wedge under a gold bezel read
  as a coin. A goldSh wedge keeps the parchment hand readable at every fraction (`r5/z-dials.png`, `z-clock.png`).
- 2026-10-17 hud r5: drawing a line in coloured runs (`segLine`) must advance `textWidth(run) + tracking`, because
  textWidth leaves out the trailing tracking. Without it the next run's first glyph touches the last one, and the ':'
  in "Cora:" merged into the 'a'. Break round toasts at ' · ' before word wrap, so a highlighted clause ("✓ your vote
  counted") stays whole on one line (`r5/z-toasts.png`).
- 2026-10-17 hud r5: a sticky hint becomes visible as a pill only when the label changes. Shrinking padding by 2 px went
  unnoticed at 1x. v2 `hints.tsx short` labels (glyph + 1-2 words, countdown kept) make the change obvious
  (`gif/s5-pill.png`, `s5-animpill.png`, `s5-pillnight.png`). Glyph-to-text gap = 3 px (2 px touched the 'S').
- 2026-10-17 hud r5: DOM drop-ins need empty `*_9s` frames with `meta.nineSlice` insets. Samples with baked text are
  references only (`*_sample`). A frame with a drop shadow is h + 1 tall and has b inset + 1. The left inset of a toast
  includes the 2-px kind rule, so the rule tiles down the edge.
- 2026-10-17 hud r5: a translucent control (the joystick well) uses the `scrim` token, not a 50 % checker. The checker
  turned into grey mesh noise over grass. Pair it with a SOLID rim ring, so the shape still reads (`r5/z-stick-night.png`).
  Add `hex(T.scrim)` to the palette audit's allowed set.
- 2026-10-17 notebook: an upright book (boards toward other players) vanished in the front views. It was a brown V on
  brown bodies, and the chin of the big chibi heads hid its cream rim (`shots/ui-notebook/r1/z/ada.png`). A book held at
  the belly with its pages UP shows the cream spread to the high camera from every facing (`r3/z-dirs-noon.png`). The
  boards still show in the closed / half drawings, so the open reads.
- 2026-10-17 notebook: a held prop must never be hidden by its own holder. With the plain grip-point depth, 3 of 8
  facings lost the book behind the reader's body (`r1/z/dov.png`, `esme.png`, `finn.png`). Depth = min(grip depth,
  reader centre − 0.5 m), tested only against OTHER scene texels (pinPass instance at order 302, eps 0.12). Readers facing
  away hold it off to their right side at 0.32 H. At 0.6 H it sat on the mushroom cap, at 0.42 H beside the rabbit's
  head (`r3/z-dirs-noon.png`).
- 2026-10-17 notebook: the portraits slot (z 75) stamps notebook-row icons at fixed panel spots, whatever page is shown.
  On the Notes page they printed over the sheet (`r3/live-noon.png`). The notebook slot redraws the page at z 76 until
  portraits skips them (CONTRACT-REQUEST).
- 2026-10-17 notebook: a 9-slice whose edge carries a periodic motif (binding holes) must have its middle height = a
  multiple of the period (notes-page: t 3 + 2 x 10 + b 5), else the holes jump at every tile seam.
- 2026-10-17 module fix (UI library): see §2.4, §2.7, §3.2–§3.5 for what landed (fonts M/W/N + display registration,
  night parchment, bedtime, variant ramps, PIN_LIT, drawRuns / annulus / shade / envelope options, depth tier, hud.stack,
  keepOut, m.top, ui=0, broken-module tags, slots, social meta, uibake files, uigif, tool fixes). A/B of every atlas
  against a same-code baseline: all day atlases (markers, emotes, indicators, portraits, cast-portraits, hud, hud-font,
  panels, events) byte-identical; changed = kit (new glyphs / tokens, re-packed), the night atlases (night parchment:
  markers-night 3194 px, events-night 851, indicators-night 325, hud-night 3226, portraits-night 9914 = the dead
  variants), social.json meta only (non-v2 keys moved under `newStyle.<group>`; social.png identical).
- 2026-10-17 module fix: PIL `getbbox()` on an RGBA difference image looks at the ALPHA band only, so an RGB-only change
  reads as "identical". Compare `tobytes()` (or the RGB difference) in A/B scripts.
- 2026-10-17 module fix: social.json used to take every group meta key at the top level (later group wins), so groups
  overwrote each other's `newStyle`. Now v2 keys stay top-level (anchors / fps only for v2 keys or frames in the atlas)
  and everything else is `meta.newStyle.<group>.*` (markers' notes are at `newStyle.markers.markers`).
- 2026-10-17 module fix, not done (outside the UI library / owner decision): `scenes/char-stage.js createActor` (loop
  clips played without `at`; pinned LegGait plans do not step) is read-only for UI and shared with the cast bakes:
  workarounds stay (`play(clip, {at: 0})`, `move: true`). Town anchors (`anchors.board`, a clocktower dial API) belong to
  the town session. The talk outline (290) under pin passes (301/302) stays a known overlap until pins move to a tier
  that the outline pass can read. Portrait icon contrast (rabbit, pale ghosts at 12 px) is portraits/cast work.
- 2026-10-17 notebook r6: a held prop's depth must beat the reader's whole silhouette, not just the body centre. Once the
  front grip moved down to 0.36 H (to show the face), the mushroom cap brim was nearer to the high camera than
  centre − 0.5 m and clipped the book top + quill (`shots/ui-notebook/r6/z/livedov8-noon.png` before the fix). Depth =
  min(grip, centre − 0.5 m, head top − 0.1 m).
- 2026-10-17 notebook r6: a tool over a cream page needs one strong silhouette and an angle the page does not have. A
  6x7 quill with a gold shaft over ink lines turned into dark scribble at 1x (critic); an upright cream quill read as a
  standing page; a 45-degree 2-texel feather on clean pages reads as "writing" (`shots/ui-notebook/bake/grid-book.png`).
- 2026-10-17 notebook r6: test a DOM skin in a real browser, not only in the mock. The headless check of `notebook.css`
  (`shots/ui-notebook/r6/dom-css.png`) showed that a 9-slice middle of 2 periods leaves half-tile gaps under
  border-image `space` at odd row counts. Make the middle ONE period, then any snapped height tiles whole motifs.
- 2026-10-17 notebook r6: a kit bitmap font can ship to the DOM as a generated TrueType face (rectangle contours, upm =
  8 x pixel units, ascent = cap, descent = line − cap). It renders crisp at integer `--px`, and missing glyphs fall back
  per character to the next family (`src/ui/notebook/ttf.js`).
- 2026-10-17 lead (integration): a teleport belongs in the Character's drive (stage time). An `onUpdate` that moved
  `st.base` ran after the Character that frame, and re-simulation fired the `appear` clip's own poof FX at the old spot
  (`shots/ui-gallery/r1/z-fix.png`). Full screen cost with every group: +3.5–4 ms CPU per frame on render-host (bare 1.0 ms,
  `game=1` 4.5 ms at 720p), and the screen-tier mock (emotes, panels, hud) is ~70 % of it: `docs/UI_GALLERY.md` §1.
- 2026-10-17 lead (integration): a 288-frame 720p PIL GIF is 78 MB. ffmpeg palettegen + `diff_mode=rectangle` brings it
  to 1.2 MB. Night frames carry the grade's film grain and stay ~10 MB, so ship the `.mp4` too (`shots/ui-gallery/pack.sh`).
- 2026-10-17 variants (notebook + markers): **two live options, the current look stays the default.**
  - **Options + API.** `hud.uiOptions = { bookStyle: 'held'|'big', pointerScale: 'new'|'v2' }`, set from the mock-HUD URL
    (`?book=big&pointer=v2`, `scenes/ui-hud.js`, also in `engine.stats.ui.options`). Groups read it every frame, so a toggle
    flips it live: `hud.setUiOptions({bookStyle: 'big'})`, or `setOptions(hud, {...})` exported by `src/ui/notebook/hud.js` /
    `src/ui/markers/hud.js`. Per call: `N.drawReader(P, m, {bookStyle})`, `M.framesFor(L, 'v2')` passed to `drawPoint`.
    **Demo integration:** two toggles, "Notebook: held / big" → `bookStyle`, "Pointer: new / v2 size" → `pointerScale`.
    The demo (`src/demo`) does not use the UI library yet, so the toggles go in when it does.
  - **Pointer v2 size: measured, not guessed** (`shots/ui-variants/measure_v2.py`, `measure_new.py`). v2 `point_<dir>_0`
    opaque bbox incl. line: 17x11 (left/right), 14x14 (diagonals), 11x17 (up/down). The v2 cast idle-down in its 32x40
    cell (`refs/ui/_src/cast-portraits`, 33 sprites) is 25–38 texels tall, median 31. So the v2 finger is 0.55 H long.
    pixel3d cast at vh 12 (diff of `cast=1` vs `cast=0` captures, staffs/FX excluded): frog 35, owl 32, fox 32,
    mushroom 35, rabbit 33, goat 40, crow 37, Storyteller 45, median 35. K = 35/31 = 1.13 gives a target of 19.2x12.4 /
    15.8 / 12.4x19.2. Drawn at **20x13 / 16x16 / 13x20** (0.57 H; the 'new' finger is 15x11, 0.43 H). New 18x11 and 14x14
    templates, painted by the same `paintGrid` (no upscaled pixels). Frames 24x24, `anchors.point` (12,12), `point.offset`
    16 (v2 14 x K), `point.size` 24, so the trail starts 12 px from the fist. Trail dots, ping, pins: unchanged.
    Atlas: **variant atlas** `out/ui/markers-v2size{,-night}.{png,json}` (`tools/uibake.sh markers:markers-v2size[-night]
    --strict`: 41/41 v2 names, same names and order as markers.json; meta.point/anchors.point changed,
    `newStyle.markers.v2size.measure`). It is a full drop-in for markers.*. Runtime: `src/ui/markers/v2size.js`
    (`markerFramesV2size(T)` tags the Map with `F.point` / `F.anchors`; `draw.js put/drawPoint` read them, absent = old).
    Evidence: `shots/ui-variants/cmp/size-v2-vs-new.png` (same texel scale) and `m1/fingers5.png` (v2 | new | v2 size,
    8 dirs).
    Learning: at 20 px the fist's lower-right form-shadow band is `glove.sh`, so creases in that tone vanish. The v2-size
    creases use `ramp(parchment, {dark: .3}).sh`. A smooth round diagonal fist read as a magnifying glass, so the curled
    fingers step down the shaded side with a crease tick at each step.
  - **Big book** (`src/ui/notebook/bigbook.js`). A tier-A marker like the finger: drawn on `L.world` at **z 18**, over the
    scene, under labels/bubbles (20) and the finger (30). Anchored at the reader's feet (screen) + 1 px (ghosts + 0.2 m
    hover), so it covers legs and belly while the face, name and stack stay clear. Open spread 25x15 (+ ribbon), cell 30x22,
    anchor (13,17) = the cover bottom under the gutter, so the spine stays put while the book flips open. Frames
    `bookbig_<phase>_<f>` + ghost `bookbigghost_<phase>_<f>`:
    - `open_0..4` at 15 fps: pop, closed (gold diamond), cover standing, cover falling (endpaper), spread
    - `hold_0..3` at 10 fps, `BIG_HOLD_SEQ`: 2.4 s still, then corner lifts / page stands / lands, seeded per reader
    - `close_0..2` at 15 fps: standing, closed, pop; skips close_0 before the cover stood
    - `write_0..3` at 10 fps: quill with a gold shaft, the ink grows a texel per drawing
    **Facing-independent on purpose.** The big book is a status marker for other viewers, not a held prop. It always sits
    on the camera side, never hidden by its reader, the same spot whatever the facing (as the finger is drawn at head +
    vector). 8 views at 25 px would change shape whenever a reader turns. The 'held' style keeps its 8 depth-tested views.
    Same materials as the held book (palette audit 36 colours, 0 untraced, day + night). Baked into
    `out/ui/notebook{,-night}.{png,json}` after the existing frames (271 frames; `meta.bigBook`).
    `notebookContext().add(fn)` also runs `fn` on a `bigOnly` view of L at z 18. `drawReader` draws 'held' readers from
    the depth pass and 'big' readers from that view.
  - **Scenes:**
    - `?scene=ui-notebook&state=variants` / `?scene=ui-markers&state=variants` (`src/ui/notebook/variants.js`): four
      captioned pairs, held+new, held+v2, big+new (ghost Esme), big+v2, on a 5.5 s loop
    - any notebook world state + `&book=big`; any markers state + `&pointer=v2`
    - stills: `shots/ui-variants/r3/{variants,nb-variants}-{noon,night}.png` + `z-*` crops
    - 1x GIFs: `shots/ui-variants/gifs/{big-close-noon,big-close-night,variants-left-noon,variants-right-noon,
      variants-left-night,point-v2-noon}/anim.gif`
- 2026-10-17 lead (integration r2): a tiny-font keycap needs 1 px of padding inside its keyline on every side and
  light caps on a raised fill; 5-row caps touching a gold keyline in gold read as a filled bar, and the 3-wide `D`
  (110/101/101/101/110) reads as `O`. The kit tiny `D` is now 4 wide (`###./#..#/#..#/#..#/###.`), so every LABEL
  string with a D is 1 px wider (`shots/ui-gallery/r2/z-pie-noon.png`).
- 2026-10-17 lead (integration r2): a pie wedge that pops out past the round back rim reads as a straight-chord
  trapezoid at R 36 (a 40° arc has a 2.3-px sagitta): keep the hot wedge inside the same annulus and mark hot with the lit
  edge + icon shift + caption. A 2×2 "current colour" dot inside a wedge reads as a stray speck; a short gold arc ON the
  wedge's rim reads as part of the pie (`r2/z-pie-hot.png`).
- 2026-10-17 lead (integration r2): a dark pin on an ink well needs a rim lighter than every ink token (iron line +
  ironHi lit edge around a black-mid body); the black ramp hi body inside the outline token vanished at 1x.
- 2026-10-17 lead (integration r2): a 1-px world hand drawn from the circle centre reads as a spear crossing whoever
  stands on its line; drawing only the outer 40 % near the voter (events `HAND_SPAN`) keeps "whose turn" without the prop.
- 2026-10-17 lead (integration r2): a fixed-layout control (hud `drawStClock`) must measure its row-1 buttons before
  placing a variable-width label + timer: "NOMINATIONS CLOSE IN" pushed the timer under the Pause button, which painted
  over its top rows (`r2/z-stclock.png`). The timer row drops 4 px when it would reach the buttons.
- 2026-10-17 lead (integration r2): offscreen-arrow names follow one rule: opposite the pointer's vertical component,
  above for sideways pointers (the 8-px extra top margin keeps an above-name in frame for every heading).
