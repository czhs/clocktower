# UI gallery — Clocktower v2 visuals in the pixel3d style (asset library)

Owner: UI lead. Contract: `docs/UI.md`. This page is the evidence index: the mock game screen with every UI group live at
once, what each group converted, where its atlas is, how much of the v2 frame-name set it covers, and how each atlas maps
onto the v2 files (notes only; `~/Desktop/pipgws` is never edited). Skipped by the user: `nicksong` (its icon,
portraits and the `nick_face` emote). `brianbi` has no pixel3d character, so its icon and portraits are out of scope.

---------------------------------------------------------------------------------------------------------------------

## 1. The mock game screen (`scenes/ui-hud.js ?game=1`)

```
tools/shot.sh  ui-hud shots/ui-gallery/game-noon.png --size 1280x720 --times 2.1,4.3 --q "game=1&tod=noon"   # tod = noon | golden | night
tools/uigif.sh ui-hud shots/ui-gallery/gif-noon 0 9.6 --q "game=1&tod=noon"                                  # 1x real time, 30 fps
tools/remote.sh bash shots/ui-gallery/pack.sh shots/ui-gallery/gif-noon 12 [w:h:x:y]                          # game.gif + game.mp4 + sheet.png
```

What is on the screen at once: the town square at the gameplay camera (vh 12, pitch 30°, 640×360 internal, ×2 at 720p),
7 cast members on the circle + the Storyteller (8 characters), and:

| v2 moment | groups | where |
|---|---|---|
| Ada points at Cleo: finger, marching trail, ping at Cleo's feet | markers | top centre to right |
| place pins on the cobbles (teal, your gold one + remove badge, Gus's orange drops / is removed), person pins over Finn | markers | left of centre, Finn |
| emote palette open (dock: Point / Pin, 8 swatches, Clear my pins, key hints), pie menu sweeping its wedges, caption plate, "?" / "!" pops | emotes | bottom right, over the Storyteller and Esme |
| name labels (player, Storyteller gold, ghost Esme + wisp, "You" chevron), speaking outline + 3-bar glyph (Gus, Cleo), chat bubbles (Bram, Cleo), guidance/compass pill, offscreen arrows (Hob, Wren) | indicators | everywhere |
| role chip, clock chip + mini dial, toolbar + phase chip, toasts, context hint pill, dock portrait button | hud, portraits | edges |
| Notebook panel open (seat rows with icons, ★ ? ✗ marks, note field, role select) | panels, portraits, notebook | left |
| Dov holding his open book (others see who reads), Finn opening / reading / closing his | notebook | Dov, Finn |
| nomination vote: seat plaques, nominee ring, gold clock hand walking the voters, raised / locked / ghost hands, HUD vote clock, caption | events | ground, left panel |
| **game-event FX moment (new for this screen):** the Storyteller poofs out of the circle centre, reappears in front of it, poofs back (events `poof_0..5` + his own `appear` clip) | events (+ lead) | centre |

Day / dusk / night: `tod=noon|golden|night` (golden is the dusk preset in `src/world/sky.js`). **Since r2, tod is lighting
only on the game screen:** one mock clock + state (`scenes/ui-game.js`, `hud.game.hudAt(t)`) drives every slot, so the
night frame shows the same day-2 vote by lantern light (r1 showed "BEDTIME" over "Raise a hand to vote"). The bedtime /
night chips are in the `phase=1` variant below, where the story actually goes to night.

### r2 (whole-screen critic 21/24 → fixes; all rendered and looked at, `shots/ui-gallery/r2/`)
```
tools/shot.sh ui-hud shots/ui-gallery/r2/game-noon.png  --size 1280x720 --times 2.1,4.3,8.9 --q "game=1&tod=noon"      # + golden, night
tools/shot.sh ui-hud shots/ui-gallery/r2/game-st.png    --size 1280x720 --times 2.1,4.3     --q "game=1&tod=noon&view=st"
tools/shot.sh ui-hud shots/ui-gallery/r2/game-phase.png --size 1280x720 --times 1.6,4.8,5.6,7.0,7.65,8.6 --q "game=1&tod=golden&phase=1"
```
| what | where (image) |
|---|---|
| **one consistent moment**: the events vote (9.6 s) drives the hud chips / toasts / hint. Clock chip "NOMINATIONS CLOSE IN" → "EXECUTION IN" once the 3rd hand locks; phase chip DAY 2 (= `MOCK_GAME.day`); toasts "Ada nominates Cleo." → "Cleo has 3 votes: enough for the block." → "Cleo is on the block (4)" when the hand has passed everyone; the events caption switches to "Cleo is on the block (4 votes)." at the same frame; hint "Hands are counted seat by seat." (→ "Vote now" pill), gone after the vote | `game-noon-00/01/02.png` (t 2.1 / 4.3 / 8.9), `game-night-02.png` |
| **chat dock (row 44)**, folded, bottom left: peek line + Chat toggle + unread pill (panels `chatFolded`, new frames `chat-*` in `out/ui/panels.json`) | every game frame; atlas crop `r2/z-chat-atlas.png` |
| **voice presence (row 22)**: the voice dock pill (dot, VOICE, mic chip, wave + "Cleo +1" = the two talk outlines), hud `SLOTS.hud[6]` | every game frame, bottom right |
| **Storyteller view** `view=st`: ST clock control in the left column (timer drops below the row-1 buttons when the label is long), host toolbar (Abort game), no role chip / notebook, the **pick crosshair (row 8)** "Move Ada here" in the gap between Gus and Ada, numbered plaques | `game-st-00/01.png`, `game-stn-00.png` (night); `r2/z-stclock.png` (before: the timer under the buttons) |
| **phase transitions (rows 54, 58)** `phase=1`: game-start banner (t 0.3), first night falls (veil, golden → night under cover, t 4.4), dawn of day 2 (t 7.6); chips BEDTIME 1 → NIGHT → DAY 2, toasts / chat peek (crier at night) follow | `game-phase-00..05.png` |
| pie: hot wedge inside the round rim, current colour = gold arc on the wedge's rim (was a stray 2×2 dot); black pin = dark body in an iron rim; pie moved off the circle (SLOTS.emotes[1] 420,268) | `r2/z-pie-noon.png`, `r2/z-pie-hot.png` |
| key caps 9 px (1 px padding), parchment caps on a raised cap; kit tiny `D` 4 wide ("DRAG" no longer reads "ORAG") | `r2/z-pie-noon.png` (dock) |
| offscreen arrows: one label rule (opposite the pointer's vertical, above for sideways): Hob and Wren both above | every game frame |
| world vote hand: only the outer 40 % near the voter (events `HAND_SPAN`) | `game-noon-00.png` (hand on Esme), `game-st-01.png` (on Gus) |
| right third: Cleo's bubble is one line ("Who was at my door?"), no longer covers Bram | `game-noon-01.png`, `game-night-01.png` |

Mixel audit (`shots/ui-gallery/audit.py`, every aligned 2×2 block of the 1280×720 frame): 0 / 230400 non-uniform on
noon-00, noon-02, night-01, golden-01, st-01, phase-03.

### Best images (all rendered and looked at)
| image | what |
|---|---|
| `shots/ui-gallery/game-noon-00.png` / `-01.png` | day, t 2.1 (arrival cloud, pin dropping, pie on crimson) / t 4.3 (Storyteller standing in front, hand on Gus, hands raised) |
| `shots/ui-gallery/game-golden-00.png` / `-01.png` | dusk, same moments |
| `shots/ui-gallery/game-night-00.png` / `-01.png` | night, same moments (lantern light travels with the Storyteller) |
| `shots/ui-gallery/gif-noon/game.gif` (`.mp4`, `sheet.png`) | the full 9.6 s events loop at 1x, 30 fps, 1280×720 (1.2 MB GIF) |
| `shots/ui-gallery/gif-golden/game.gif`, `gif-night/game.gif` | dusk / night, the poof window 0.8–3.2 s at 1x (night GIF is 10 MB: the night grade's film grain changes every frame; use the `.mp4`) |
| `shots/ui-gallery/gif-poof/game.gif`, `gif-poof/z-poof.png` | the poof moment ×2 crop at 1x; the strip shows every 3rd frame: cover, gone, arrival cloud, the appear clip's thin column / squash / stand, label + "?" pop return exactly when he does |
| `shots/ui-gallery/r1/z-fix.png` | before / after of the FX-position fix (§4) |
| `shots/ui-gallery/r1/z1x-night.png` | 1:1 crop at 720p, night: labels, bubble, pins, finger trail, pops, hands and plaques read at game size |

### Perf (render-host headless Chrome, RTX 4090; `engine.stats.frameMs` = CPU time of the last frame, 30-frame runs)
| run | 640×360 | 1280×720 |
|---|---|---|
| `ui=0` (bare scene) | 1.1 ms | 1.0 ms |
| `game=1` (everything) | 5.2 ms | 4.5 ms |

Per-group draw cost, `engine.stats.ui.perf.meanMs` over the 288-frame noon loop (ms per UI frame): emotes 1.00, panels
0.90, hud 0.85, events 0.57, indicators 0.42, markers 0.12, portraits 0.04, notebook 0.00 (its books draw in the depth
pass) = **3.9 ms**; the rest is the two layer texture uploads + the UI passes (talk outline 290, ui-world 300, books
302). Draw calls 96 → 101. Within a 16.7 ms frame on this machine, but it is CPU work that scales with a slower CPU. In
the real game the screen-tier HUD (hud, panels, emotes dock / pie) stays DOM with the baked skins (§3), so only
markers + indicators + events + notebook books (≈ 1.1 ms here) would run per frame on the canvas.

Known limits of the mock: each group loops on its own clock (markers 6 s, notebook 6.5 s, emotes 8 s, events + moment
9.6 s), so the GIF is not a seamless loop; at t ≈ 2.4 s the vote hand on Esme brushes the Storyteller's feet for 3
frames; Bram (owl) and Finn are very dark at night (scene lighting, not UI: a PointLight fill over the circle made no
visible difference, `r2/z-fill0.png` vs `z-fill6.png`; left to the cast / lighting owners). r2 gaps: role plaques (row
25) have no art in any atlas yet (portraits group); the open chat dock and role card (27) are atlas-only, not on a game
screen; tower clock hands (31) need the town's tower in frame. The r2 vote / phase states loop on 9.6 s; the toast that
lands at 8.5 s is cut by the loop wrap at 9.6 s. The `phase=1` banner covers labels in its band for its 4 s (slot rule).

---------------------------------------------------------------------------------------------------------------------

## 2. Per group

Coverage = v2 frame names present / v2 names in scope (`tools/remote.sh python3 shots/ui-gallery/coverage.py`, against
the v2 manifests in `refs/ui/_src/`). Groups whose v2 elements were drawn in code or DOM have no v2 sprite names; their
atlas is new-style only.

| group | converted (v2 inventory rows, `docs/UI.md` §1) | atlas | v2 coverage | best images (looked at) |
|---|---|---|---|---|
| markers | pins ×8 colours, pin shadow, pin drop, pointing finger 8 dirs × 3, ping, point trail, remove badge, ST pick crosshair (1–8); place pins depth-tested (pass 301) | `out/ui/markers.{png,json}` + `markers-night` | **41/41** (`pin_*`, `point_*`, `ping_*`) + 7 new (`pin_remove`, `trail_0..1`, `ping_mark`, `pick_0..2`) | `shots/ui-markers/bake/markers-sheet.png`; in the game screen: Ada's finger + trail, Finn's pins |
| emotes | `emote_point`, radial pie (mouse / touch, hot / off wedges, hub, caption), social dock (toggles, swatches, Clear, key hints, armed), open / close animation, in-world emote pops (9–12) | `out/ui/emotes.{png,json}` | **1/1** (`emote_point`) + 199 new (`emote_pop_*`, `emote_pie_*`, dock parts, `emote_pin_*`) | `shots/ui-gallery/sheets/top-emotes.png` (top of `shots/ui-emotes/bake/emotes-sheet.png`); game screen bottom right |
| indicators | name labels (player / ST / ghost / you), talk outline + 3-bar glyph (self, muted), speech bubbles (9-slice + tail, lifted), "You" marker, guidance arrow + door ring, compass pill, house callouts, door tokens, offscreen arrows (13–21) | `out/ui/indicators.{png,json}` + `indicators-night` | no v2 sprite names (v2 drew in code); 77 frames | `shots/ui-indicators/bake/indicators-sheet.png`; `shots/ui-gallery/r1/z1x-night.png` |
| portraits | `icon_<castId>` 12×12 (alive / ghost / ghost-spent / dead), 24×24 avatars, `cast-portraits` 32×40 cells (idle + walk1..4, ghost, ghost-spent) rendered from `characters/*` (23–24) | `out/ui/portraits.{png,json}` + `portraits-night`; `out/ui/cast-portraits.{png,json}` | icons **31/31** (minus nicksong, brianbi) + 187 new; cast-portraits **83/83** sheet keys (minus 6 nicksong / brianbi) + 26 new | `shots/ui-gallery/sheets/top-portraits.png`, `top-cast-portraits.png` |
| hud | role chip, role card, clock chip + mini dial (stages, urgent, paused), proposal vote card, ST clock control, tower clock hands (tier W), toolbar + phase chip, toasts, hint pill, countdowns, voice presence, joystick, connection banner, display font (22, 26–38) | `out/ui/hud.{png,json}` + `hud-night`; `out/ui/hud-font.{png,json}` | no v2 sprite names (DOM); 250 frames, font 143 glyph frames; `*_9s` empty 9-slices with `meta.nineSlice` | `shots/ui-gallery/sheets/top-hud.png`; game screen top edge |
| panels | panel kit as a DOM skin: 9-slices for every button / input state, tabs, checkbox / radio / switch, slider, scrollbar, dividers, pamphlet, badges, rows, modal, cursors, spinner, 16×16 glyph set; `panels.css` (39–49) | `out/ui/panels.{png,json}`, `out/ui/panels.css` | **22/22** (`apps/client/public/art/ui/*` names) + 140 new | `shots/ui-panels/bake/panels-sheet.png`; game screen Notebook |
| events | seat plaques (stone / you / dead / nominee), vote pulse, clock hand tips, nominee ring, raised / locked / ghost hands, HUD vote clock, captions, night veil, dawn, toll, bell, wisp, ghost reveal, candle, halo, banners + emblems, poof, glows (50–59) | `out/ui/events.{png,json}` + `events-night` | **8/8** (`poof_0..5`, `glow_warm`, `glow_cool` from `square-props.json`) + 79 new | `shots/ui-events/bake/events-sheet.png`; `shots/ui-gallery/gif-poof/z-poof.png` |
| notebook (extra) | Notes page (lined sheet, tabs, caret, scrollbar, status), the in-world "reading" book 8 dirs (open / hold / close / write + ghost) (41b, 41c) | `out/ui/notebook.{png,json}` + `notebook-night`, `out/ui/notebook.css` | no v2 sprite names (new); 239 frames | `shots/ui-gallery/sheets/top-notebook.png`; game screen Dov / Finn |
| kit (lead) | body + tiny fonts, frames, tokens | `out/ui/kit.{png,json}` (`meta.bitmapFont`) | — ; 249 frames | `shots/ui-kit/bake/kit-sheet.png` |
| social (lead composite) | markers + emotes + portraits icon frames re-packed with the v2 meta | `out/ui/social.{png,json}` | **73/73** v2 names of `social.json` (skipped: `nick_face`, `icon_nicksong`, `icon_brianbi`) | — (same frames as the sheets above) |

---------------------------------------------------------------------------------------------------------------------

## 3. Porting to Clocktower (notes only; never edit pipgws)

v2 paths relative to `pipgws/`. The v2 client loads the generated atlases through `packages/assets/src/runtime.ts`, which
imports the **`.webp`** twins (`cast-portraits.webp`, `social.webp`, …) for the browser and the `.json` manifests
through `import.meta.glob`. Every drop-in therefore needs its PNG re-encoded as **lossless** WebP next to the PNG
(`cwebp -lossless -exact`; lossy WebP smears the 1-texel lines and binary alpha).

| new atlas | replaces | read by (v2) | notes |
|---|---|---|---|
| `out/ui/social.{png,json}` | `packages/assets/generated/social.{png,webp,json}` | `apps/client/src/game/social/art.ts` (pins, finger, ping, drop, icons; sequences from `meta.fps`, `meta.point`, `meta.pinIcon`), `gameplay/boardTokens.ts` (icons) | same names, anchors, `meta.icons/pinColors/pinColorHex/pinIcon/point/place`. New fps: `pin_drop` 15 (v2 14), `point` 7.5 (v2 8) — art.ts reads `meta.fps`, so the game picks them up. Missing on purpose: `nick_face` (check `social/nickFace.ts` falls back or is disabled), `icon_nicksong`, `icon_brianbi` (art.ts already has a `cast.png` bust fallback). New-style extras live under `meta.newStyle.<group>` and are ignored by v2 |
| `out/ui/markers.json` etc. | — | — | group atlases are the sources of `social`; only `social` ships |
| `out/ui/cast-portraits.{png,json}` | `generated/cast-portraits.{png,webp,json}` | `apps/client/src/ui/common/castPortrait.ts` (`sheets[<key>]`, cells 32×40, dir `down`) | v2 steps WALK [1,2,3,4] every 140 ms and ignores the manifest; the new walk is one 15 fps cycle: step at `meta.walkStepMs` 67 (or keep 140: `?walk=v2` preview). `<id>/dead` is new (memorial tone) |
| `out/ui/events.json` `poof_*`, `glow_*` | frames in `generated/square-props.{png,webp,json}` | `game/TownScene.ts` (`FX_JSON`, `poof()` builds `fx#poof` from `meta.fps.poof`) | merge the 8 frames into square-props (the rest of square-props is town art, owned elsewhere) and set `meta.fps.poof` 15 so the hold stays 2 grid frames; anchor `poof` (16, 38) unchanged. All other events frames (plaques, hands, vote clock, captions, veil, wisp, banners) replace Phaser graphics in `game/gameplay/index.ts` and `TownScene.onPhaseChange`: new code, keep v2 durations (`docs/UI.md` §2.8) |
| `out/ui/panels.{png,json}` + `panels.css` | `apps/client/public/art/ui/*.png` (22 names, `manifest.json`) + the DOM skins in `ui/common/theme.css` | every DOM panel | `panel` keeps the v2 slice 8 (`border-image: … 8 fill / calc(8px * var(--px))`); `panels.css` inlines frames as data URIs; tokens map 1:1 to theme.css variables; `--px` = integer UI scale; `image-rendering: pixelated`; `select { appearance: none }` |
| `out/ui/hud.{png,json}` (+ `hud-night`) | DOM in `ui/hud/*`, `ui/clock/*`, `ui/common/help.css`, `game.css` | — | DOM adopts the empty `*_9s` frames (`meta.nineSlice` insets) and the glyph frames; `*_sample` frames are references only. Tower clock hands: `src/ui/hud/tower.js` → `TownScene.drawTownClock()` as sprites over the tower face |
| `out/ui/hud-font.{png,json}`, `out/ui/kit.json meta.bitmapFont` | Phaser `Text` (Alegreya Sans) on labels / bubbles | `game/TownScene.ts Avatar.label`, `social/bubbles.ts` | Phaser `BitmapText` from the glyph tables; DOM may keep the vector fonts (a11y, i18n) |
| `out/ui/indicators.{png,json}` | Phaser graphics in `TownScene.ts`, `social/bubbles.ts`, `fx/talking.ts`, `gameplay/{index,houseNames,boardTokens,doorTags}.ts` | — | new code over the same state; the talk outline is a low-res post pass (`src/ui/indicators/talkOutline.js`): in Phaser use a dilated silhouette per talking avatar in the two-ring style |
| `out/ui/emotes.{png,json}` | `ui/social/PieMenu.tsx` + `pie.css`, `SocialPalette.tsx` + `social.css` | — | pie wedges are pre-drawn per state (mouse R 36 / touch R 46 texels at ×2); dock parts as 9-slices; emote pops are new (needs a tiny protocol event, like the point emote) |
| `out/ui/notebook*.{png,json}` + `notebook.css` | `ui/notebook/*`, `notebook.css` | — | see `docs/UI.md` §5 (Notes page tabs; the "reading" book needs a per-player presence flag, server-scoped like positions) |

Rendering rules for every drop-in: integer zoom only (`pixelArt: true`, `roundPixels: true`), anchors as in the
manifests, world UI (labels, bubbles, finger, hands) above avatars, ground UI (pings, plaques, rings) under them
(`docs/UI.md` §2.2), stepped motion on the 30 Hz grid with the v2 durations.

---------------------------------------------------------------------------------------------------------------------

## 4. Learnings from the integration round
- 2026-10-17 lead: a teleported character needs its position in the Character's **drive** (stage time), not in an
  `onUpdate` that moves `st.base`: the update ran after the Character that frame, and re-simulation fired the `appear`
  clip's own poof FX (debris + a warm night glow) at the OLD spot (`shots/ui-gallery/r1/z-fix.png`, before / after).
- 2026-10-17 lead: in a mock where the vote hand starts at the circle centre, a Storyteller standing on a seat's line
  reads as holding a spear. His away spot sits in front of the centre (180°), which the hand avoids while he is there.
  `hud.st.pos` stays at the centre (the v2 hand origin); his label / pop follow `hud.st.feet()`.
- 2026-10-17 lead: a 288-frame 1280×720 GIF straight from PIL is 78 MB; ffmpeg palettegen + `diff_mode=rectangle` makes
  it 1.2 MB (the HUD is static). Grain-graded night frames do not compress (10 MB): ship the `.mp4` beside the GIF.
- 2026-10-17 lead r2: drive every HUD slot of a mock from ONE clock + state object (`hud.game.hudAt(t)`): each group
  looping its own copy produced a screen that contradicted itself (VOTES 2/3 beside "Cleo: 4 votes", BEDTIME over
  "Raise a hand"). Treat tod as lighting only; put real phase changes in their own variant.
- 2026-10-17 lead r2: two groups that both paint the panel slot (panels' notebook + portraits' row icons) must agree on
  the panel being hidden: with `panel=none` the portrait icons floated over the town (`game-st` first try).
- 2026-10-17 lead r2: when another session edits a shared scene at the same time, put new lead code in its own module
  (`scenes/ui-game.js`) and hook it with 3 small anchored edits; re-read the shared file right before each edit.
