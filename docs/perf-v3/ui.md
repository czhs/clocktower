# v3 perf — front "ui" (v3-perf-ui, 2026-10-18)

The DOM/CSS side of a v3 game screen: `ui/hud/**`, `ui/storyteller/**`, `ui/social/**`, `ui/chat/**`,
`ui/common/{v3skin,v3skinLobby,v3atlas,v3portrait}`. Branch `v3-perf-ui` (from `v3-game` 0cfd0b8 "v3 C1").

**Verdict: the DOM UI is not where a v3 game screen spends its time.** In a 15-player Hollowmere game on the
host GPU the UI chunks' own JavaScript is about 2-3 ms per second (≈ 0.3 % of the main thread); the 3D town
(`town3d` chunk + GL calls) is 500-580 ms per second. The HUD's own DOM churn is about 2 writes/s
while walking (the compass), 3-4/s during a vote. Style recalculation runs once per frame (60/s, 7-12 ms/s in
total) and is driven by the overlay's per-frame label transforms, not by the HUD. Layout: 0-3 per second,
≤ 1.1 ms/s. No long tasks from the UI. So this front landed two small fixes (no layout read in a timer, no
whole-document restyle from unchanged CSS variables) and a repeatable measurement tool with budget proposals.

## Tool: `tests/perf/v3-ui.ts`

A real game, not a harness: own server (127.0.0.1, ports 3480-3484) serving a client build, 1 Storyteller bot +
14 player bots wandering at 10 Hz + the browser as the 15th player, in a Hollowmere (`world: 'v3'`) lobby,
headless Chromium on the host RTX 3060 (ANGLE/Vulkan; `CT_GL=swiftshader` for CPU raster), 1440x900, the
default quality tier (picked `high`, pixelScale 3). Windows of `--win` seconds (12 here):

| window | what runs |
|---|---|
| idle | the page standing outdoors by day, 15 others wandering |
| walk | the page walking a WASD square on an open outdoor spot near the square (Storyteller teleport first; the walked px are recorded) |
| vote | a 15-seat nomination vote running (clock hand moving, 8 hands going up), the page standing |
| bedtime | (added after the baseline) the walk-home phase: hint + countdown + compass, the page walking |

Per window: DOM mutations/s (a MutationObserver on `<body>`) in total, without transform-only `style` writes
(`domMutationsNoTransformPerSec`, the D2 wording of `v3WalkDomMutPerSec`) and the DOM UI's own share
(`domMutationsUiPerSec`: non-transform writes outside the `.ct-v3-*` overlay), the top churning elements, style
recalcs and layouts per second / per frame and their ms/s, long tasks, rAF fps / frame p95, the overlay's own
counters (`__ctCamera.overlay()`), and with `--profile yes` a V8 CPU profile summarised as self ms/s per
script file plus the top functions of the UI chunks (`index-*`, `LobbyRoute-*`, `storyteller-*`, …). Static: CSS
files (bytes, rules) and every image fetched with its start time.

```
CT_AGENT=v3-perf-ui scripts/remote.sh pnpm --filter @ct/client build      # (shared heavy lock)
CT_AGENT=v3-perf-ui scripts/remote.sh flock $HOME/clocktower/v3-heavy.lock \
  pnpm exec tsx tests/perf/v3-ui.ts --dist apps/client/dist --win 12 --label base [--profile yes] [--only walk,vote]
# → test-results/v3-ui/v3-ui-<label>.json
```

Caveat: the probe itself costs main-thread time (the MutationObserver sees ≈ 300-550 records/s from the overlay
and reads `class` / `style` for each: `getAttribute` shows up at 6-13 ms/s in the profile), so absolute busy %
is a little high; compare runs of the same tool.

## Baseline (v3-game 0cfd0b8, host GPU, 1440x900, tier high, 15 players)

Two runs of the same build (`base` 18:46 UTC, `base` with profile 19:14 UTC); the profiled run in brackets.

| | idle | walk | vote |
|---|---|---|---|
| fps / frame p95 ms | 58.7 (60.6) / 16.8 | 59.7 (60.4) / 16.8 | 59.1 (57.2) / 16.7 (33.3) |
| main thread busy % / script % | 73.6 (76.4) / 67 (65.7) | 72.6 (80.9) / 66.1 (72.4) | 73.5 (89.8) / 65.7 (79.5) |
| `town3d` chunk self ms/s | (500) | (533) | (580) |
| UI chunks self ms/s (index + LobbyRoute top functions) | (≈ 2.4) | (≈ 2.7) | (≈ 2.6) |
| DOM mutations/s, all | 398 (322) | 540 (542) | 305 (246) |
| … without transform-only writes | 5.7 (2.7) | 12.0 (12.9) | 6.3 (6.7) |
| … of which the DOM UI (not `.ct-v3-*` overlay) | ≈ 0 | ≈ 1.9 (compass text) | ≈ 3 (vote clock SVG, tally text, toasts) |
| style recalcs/s (per frame) / ms per s | 57.5 (0.98) / 9.0 | 59.6 (1.0) / 11.3 | 59.1 (1.0) / 12.1 |
| layouts/s / ms per s | 0.3 / 0.1 | 1.9 / 0.4 | 2.8 / 2.0 |
| long tasks (n, max ms) | 1, 204 (0) | 0 (0) | 0 (0) |
| DOM nodes | 563 | 563 | 681 |

Top churn while walking (base): `449/s T style span.ct-v3-label` (overlay label transforms), `78/s T style
span.ct-v3-callout`, `9.2/s style span.ct-v3-label` (overlay non-transform: visibility / opacity), `1.9/s T
style span.ct-compass-arrow`, `1.8/s text div.ct-compass`, `1.8/s style span.ct-v3-callout`. During the vote:
`0.7/s class circle.ct-vc-seat`, `0.4/s text div.cth-tally`, `0.3/s` hand line `x2/y2`, clock-hand hint text.
The HUD (`.cth-*`), chat (`.ct-chat*`), social dock and voice panel write nothing while walking.

Where the non-transform writes come from (walk, 12/s): ≈ 9-11/s the 3D overlay (`game3d/overlay/**`,
v3-perf-client's area: label visibility/opacity + callouts), ≈ 2/s the compass (`game/GameScreen.tsx`, the
main checkout's file). Neither is in this front's files. The D2 budget `v3WalkDomMutPerSec ≤ 5` is
therefore decided by the overlay (its own counter reported 6.5/s `visibilityPerSec` in this walk).

Static (v3 game page, uncompressed bytes as served by the test server): CSS `index-base` 46.2 KB + `index`
11.4 KB (entry; ≈ 12 KiB br, budget 15), `LobbyRoute` 38.5 KB, `townParts` 13.7 KB, `StoryParts` 5.0 KB,
`SettingsDialog` 6.2 KB, the vendor `panels.css` 81.6 KB (v3 lobbies only, linked by `v3atlas.skin()` once the
day atlases are in; ≈ 27 KiB br, data: URIs). Images: v3 `cast-portraits` 45.8 KB (WebP) at 0.45 s; the v2
`cast-portraits` 60.6 KB and `cast-hd-portraits` 94.1 KB at 0.65 / 0.8 s (documented: the v3 strip skips
nicksong / brianbi, which keep their v2 art); `events-night` 4.6 KB at 0.09 s (the v3 loading screen); at
8.3 s the overlay's 8 sheets (day AND night, ≈ 97 KB); `cast-hd` 757 KB at 23 s (the billboard bodies,
`game3d/avatars/billboard.ts`).

## Changes (commit "v3 perf(ui): …")

1. **Social dock: no layout read in its 1.5 s poll** (`ui/social/SocialPalette.tsx`). The dock places itself
   beside the voice panel; it re-measured with `getBoundingClientRect()` every 1.5 s, forcing a style (and,
   when dirty, layout) flush between 3D frames. The poll now only checks whether the panel element changed
   (`querySelector`, no layout); size changes come from the ResizeObserver (now `box: 'border-box'`, so a skin
   that changes the panel's border is seen too) and viewport changes from `resize`. Placement is unchanged.
2. **v3 skin: write a CSS variable on `<html>` only when its value changes** (`ui/common/v3atlas.ts`). A custom
   property on the root restyles the whole document. `skin(look)` rewrote all ≈ 40 token variables on every
   call (it runs again when the night atlases land), and `--px` was rewritten on every `resize` event (a
   window drag fires dozens per second). Now unchanged values are skipped. Same look.

After (same tool, `new1` = the commit above): see the table below. The change is below the noise of a 12 s
window by design (≤ 1 forced flush per 1.5 s; the resize path only matters while a window is resized).

Back-to-back, same session of the tool, both with `--profile yes` (19:14 UTC base, 19:26 UTC new1):

| | idle base → new1 | walk base → new1 | vote base → new1 |
|---|---|---|---|
| fps / frame p95 ms | 60.6 → 60.3 / 16.8 → 16.8 | 60.4 → 60.4 / 16.8 → 16.8 | 57.2 → 60.2 / 33.3 → 16.8 |
| main thread busy % | 76.4 → 81.9 | 80.9 → 73.5 | 89.8 → 78.3 |
| `town3d` self ms/s | 500 → 536 | 533 → 490 | 580 → 526 |
| UI-chunk self ms/s | 2.5 → 2.3 | 2.6 → 2.3 | 2.6 → 2.0 |
| DOM mutations/s, non-transform | 2.7 → 4.2 | 12.9 → 13.0 | 6.7 → 5.3 |
| … DOM UI only (outside `.ct-v3-*`) | 0 → 0 | 1.8 → 1.9 (compass text) | ≈ 3.3 → 2.9 |
| style recalcs per frame / ms per s | 0.95 / 7.4 → 0.91 / 7.0 | 0.99 / 11.6 → 0.99 / 10.8 | 0.99 / 10.6 → 0.99 / 10.4 |
| layouts/s / ms per s | 0 / 0 → 0 / 0 | 1.8 / 0.3 → 1.9 / 0.3 | 2.7 / 1.1 → 2.7 / 1.3 |
| long tasks | 0 → 0 | 0 → 0 | 0 → 0 |

The busy % / `town3d` swings (± 40 ms/s) are the 3D town and the shared host (other agents' runs), not this
change; every UI-owned number is flat or a little lower. Typecheck (`pnpm -r run typecheck`) and the unit tests of
the touched areas (8 files / 149 tests: `ui.v3atlas`, `ui.v3skin`, `social.{logic,radial,controller}`,
`hud.{logic,rate}`, `chat.logic`) pass.

## What was checked and left alone (already right)

- HUD (`ui/hud/index.tsx`) re-renders on `gameView` changes only; `MoveHint` derives `where` from the per-frame
  `localPlayer` store but Preact's `useState` bails out on an equal value, so no per-frame render; `Countdown`
  re-renders 4×/s but writes one text node per second. Memoising more would not change a measured number.
- Chat (`ui/chat/index.tsx`): `useWhere` handles `world:snapshot` (10 Hz) with a string-key check and renders
  only on a change; the outbox pump runs only while messages are queued.
- `v3skinLobby` touches the skin store only on a look change (hour updates ride along).
- CSS containment (`contain: layout paint`) on HUD panels: layout is 0-3/s and ≤ 2 ms/s in total, so there is
  nothing to contain; `paint` containment would clip shadows / tooltips (a visual change). Not applied.
- Lazy v3 atlases: `v3atlas` is already a lazy chunk; its sheets are fetched by CSS backgrounds on use; only the
  JSON manifests load up front.

## Proposed budget keys (not added to `scripts/perf/budgets.mjs`; source = `tests/perf/v3-ui.ts` JSON)

| key | max | measured (base) | source |
|---|---|---|---|
| `v3UiWalkDomMutPerSec` | 4 /s | ≈ 1.9 | `walk.domMutationsUiPerSec` (DOM UI writes, non-transform, outside `.ct-v3-*`) |
| `v3UiVoteDomMutPerSec` | 8 /s | ≈ 3 | `vote.domMutationsUiPerSec` |
| `v3WalkStyleRecalcsPerFrame` | 1.2 | 1.0 | `walk.styleRecalcsPerFrame` |
| `v3WalkLayoutsPerSec` | 5 /s | 1.9 | `walk.layoutsPerSec` |
| `v3UiScriptMsPerSec` | 10 ms/s | ≈ 2.7 | `walk.profileByFile`, sum of the UI-chunk functions (`--profile yes`) |

The page-wide `v3WalkDomMutPerSec ≤ 5` (D2, non-transform) is `walk.domMutationsNoTransformPerSec` here: 12-13/s
at 0cfd0b8, of which ≈ 10 are the overlay's (see v3-perf-client).

## Follow-ups (other owners)

- **Overlay non-transform writes** (`game3d/overlay/**`, v3-perf-client): 9-11/s label `style` writes that are
  not transforms (visibility / opacity) + callout writes keep the page at 12/s against the D2 budget of 5/s.
- **Compass** (`game/GameScreen.tsx`): ≈ 1.8 text + 1.9 arrow writes/s while walking (the v2.4 gate at 2/s holds).
- **Overlay loads the night sheets by day** (`game3d/overlay/atlas.ts`): the 4 `-night` sheets were fetched at
  8.3 s in a day game (recon-net #6).
- **`cast-hd` (757 KB) in a v3 game** (`game3d/avatars/billboard.ts`): fetched at 23 s for billboard bodies.
- An intermittent page error `TypeError: Cannot read properties of undefined (reading 'isReady')` appeared twice
  in the first baseline run (not in the next two; minified, no stack captured; the runner now records stacks).
