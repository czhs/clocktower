# Pre-sign-in tour ("Watch the tour")

A short, skippable tour shown before sign-in: 8 cards (4 for invite links), each a looping, muted
clip of **real v2 gameplay** with a one-line caption. The footage is recorded by a script, so it can
be refreshed with one command whenever the art or UI changes.

| Piece | Where |
|---|---|
| Tour UI (Preact) | `apps/client/src/ui/intro/` (`IntroTour`, `IntroHost`, `WatchTourLink`, `openIntro`, `shouldAutoShowIntro`, `markIntroSeen`) |
| Card copy (title + 1-2 lines per clip) | `apps/client/src/ui/intro/cards.ts` |
| Footage + manifest | `apps/client/public/tutorial/` (`<clip>.webm` VP9, `<clip>.mp4` H.264, `<clip>.webp|jpg` poster, `manifest.json`) |
| Capture script | `tests/e2e/capture-tutorial.spec.ts` + `tests/e2e/tutorial.config.ts` |
| UI checks | `tests/e2e/tutorial-intro.spec.ts` (screenshots: `docs/screenshots/tutorial-*.png`) |

## Current footage (v2, recorded 2026-10-15 on the RTX 3060 from the shared tree: `e5d31ef` plus uncommitted v2.1 work)

Contact sheet (one poster per clip): `docs/screenshots/v2-tutorial-clips.png`.

| Clip (card) | What it shows | Length | WebM (VP9) | MP4 (H.264) | Poster (WebP) |
|---|---|---|---|---|---|
| town (One square, fifteen cottages) | morning: Ada presses Leave, steps out of her cottage and walks (keyboard) onto the square while everyone comes out of their cottages; the camera settles on the square | 4.7 s | 253 KB | 312 KB | 126 KB |
| inside (Tap a cottage for a private word) | Bram clicks his cottage and walks off, Ada clicks it too and follows; the door opens by itself, then the cosy room view: "In here with Bram — only you two can hear each other" | 7.2 s | 300 KB | 270 KB | 22 KB |
| point (Point, and pin your suspects) | 1.5x close-up of the group: Ada right-clicks Dov (pointing hand), presses F over Esme and Dov (pins with her face), Bram pins Esme too | 5.8 s | 285 KB | 271 KB | 92 KB |
| notebook (Keep a private notebook) | N opens the notebook: ★ on Cora, a note on Dov typed in, ✗ and a note on Esme; "Only you can see this — not even the Storyteller" | 6.9 s | 308 KB | 351 KB | 95 KB |
| night (At the bell, walk home) | the Storyteller rings the bell from the stage-script cue bar; everyone heads home, Ada clicks her cottage and walks in ("You are home"); then the Storyteller's view of the square as night falls, windows lit | 9.5 s | 277 KB | 317 KB | 41 KB |
| visit (The Storyteller visits in secret) | Ada alone at home at night; the Storyteller poofs in ("The Storyteller is visiting you: this conversation is private"), the Fortune Teller prompt, Ada picks two players and confirms | 8.9 s | 107 KB | 119 KB | 27 KB |
| vote (Gather, nominate, vote) | the circle around the clock tower, Cora nominates Bram, Ada raises her hand, the clock hand, "your vote counted"; then a close-up of Bram as a ghost with a halo ("you have 1 ghost vote") | 9.5 s | 305 KB | 310 KB | 120 KB |
| storyteller (The Storyteller runs the show) | the Storyteller's screen: Tonight's visits, a click on the map (poof, across the square), Go on Ada's visit (poof, inside her home), Ask, the answer arrives | 9.0 s | 242 KB | 279 KB | 30 KB |

Total 4.7 MB on disk (both formats + posters). A browser downloads one format: ≈ 2.1 MB of WebM for
the whole tour, fetched one card at a time. Captured at 58-60 fps, resampled to 24 fps.

## Behaviour

- **First visit:** `IntroHost` opens the tour by itself once (localStorage `ct.intro.seen.v1`). With
  storage blocked it never auto-opens. Automation (`navigator.webdriver`) is opted out, so the tour
  never covers the sign-up form in other e2e specs. A spec opts back in with localStorage
  `ct.intro.autotest = '1'`.
- **Afterwards:** "What is this? ▶ Watch the tour" on the landing screen (`WatchTourLink` /
  `openIntro()`), and "▶ Watch the tour" in the How to play dialog. The dialog loads the tour on
  demand, on every screen.
- **Invite links** (`/lobby/<id>`): 4 cards (town, inside, visit, vote). "Join the game" is the main
  action on every card, and `onAction('join')` lets the landing screen go straight to account creation.
- Next/Back, diamond dots, ←/→, Esc (= skip), and swipe on the clip. "Skip — create account /
  sign in" is always visible. Keys never reach the game behind the tour.
- **Performance:** the tour is its own lazy chunk. Only the current clip loads, plus the next
  card's poster and video metadata (`preload="metadata"`), and posters show first. Clips are
  same-origin static files (CSP `media-src 'self'`) and are not part of the JS bundle.
- **Reduced motion:** a poster and the captions, plus a Play button. Clips never autoplay.
- **Missing footage:** each card falls back to a glyph placeholder, so the tour still works.

## Re-recording the footage (e.g. after the art overhaul)

Everything runs on hshi-u1 (RTX 3060). Use one capture at a time: it uses 3 browser contexts.

```
CT_AGENT=tutorial scripts/remote.sh pnpm capture:tutorial
CT_AGENT=tutorial scripts/pull.sh apps/client/public/tutorial
```

That builds the app and starts a private server on 127.0.0.1:3350 (temp DB, random secrets; never
3000/3001). It plays one scripted v2 game (about 2 minutes of play, 4-6 minutes with encoding) and
writes `apps/client/public/tutorial/`. The cast is the Storyteller (1280x720, scaled to 960x540) +
Ada and Bram (960x540) in Chromium, plus 7 protocol bots. The bots are moved by the Storyteller's own
`walk_to` stage command (server-driven walking at normal speed, in and out of doors); they also
nominate and vote. Ada and Bram use the real client: keyboard walking, clicking a cottage
(`helpers.tapCottage`), the Leave button, right-click / F, N, and the prompt card. The Storyteller uses
the stage-script panel (bell cue, Go, Ask, Tell them) and click-to-teleport. Screen positions come from
the client's opt-in camera hook (`localStorage ct.debug.camera`), with `helpers.outdoorCamera` as the
fallback. A clip can carry a fixed crop (`zoomOn`: a 1.5x close-up for pins and the ghost) and a
poster moment (`posters[clip]`).

Scene order follows the game: night (setup → bedtime → first night), visit + storyteller (first night),
then by day town, inside, point, notebook, vote. `pull.sh` does not delete files, so remove clips that
were dropped (e.g. the old `talk.*`) by hand. Look at the result before committing.
`test-results/tutorial-raw/verify/<clip>-{1,2,3}.jpg` holds frames from each final clip, and
`test-results/tutorial-raw/capture-log.txt` holds the log (both on hshi-u1).

- If a scene fails, the log says which one, `fail-<scene>-{ada,st}.png` is saved, and the other clips are
  still encoded. A card without a clip shows its placeholder.
- **Shared working tree:** the capture builds whatever is in the synced tree. If another session's
  half-finished edits break the build, record from a clean snapshot of a commit plus the tutorial
  files:
  ```
  SNAP=$(mktemp -d) && git archive HEAD | tar -x -C "$SNAP"
  # only while these files are uncommitted / untracked:
  for f in tests/e2e/capture-tutorial.spec.ts tests/e2e/tutorial.config.ts package.json; do cp "$f" "$SNAP/$f"; done
  rsync -a apps/client/public/art "$SNAP/apps/client/public/"
  (cd "$SNAP" && CT_AGENT=tutorial-cap scripts/remote.sh pnpm capture:tutorial \
              && CT_AGENT=tutorial-cap scripts/pull.sh apps/client/public/tutorial)
  rsync -a --delete "$SNAP/apps/client/public/tutorial/" apps/client/public/tutorial/
  ```
  (The v1 footage was recorded this way. The v2 footage was recorded straight from the shared tree.)
- Re-encode only (no replay), e.g. after changing the size caps:
  `CT_TUTORIAL_ENCODE_ONLY=1 pnpm capture:tutorial`. Size caps: `CT_TUTORIAL_WEBM_MAX` /
  `CT_TUTORIAL_MP4_MAX` (bytes per clip; defaults 330 000 / 400 000).

### Rendering

The contact sheet `docs/screenshots/v2-tutorial-clips.png` is the 8 posters in a 2x4 grid with labels,
built with the same ffmpeg (`xstack` + `drawtext`) on hshi-u1.

Headless Chromium runs with `--use-angle=vulkan --enable-features=Vulkan --enable-gpu
--ignore-gpu-blocklist`, which gives hardware WebGL on the RTX 3060
(`ANGLE (NVIDIA, Vulkan … NVIDIA GeForce RTX 3060 …)`). The spec checks the WebGL renderer string
and refuses to record on SwiftShader (~1 fps). Override with `CT_TUTORIAL_ALLOW_SOFTWARE=1` for a
dry run only. Frames come from the CDP screencast (JPEG q92 with timestamps). They are cut into
timed segments, resampled to 24 fps with 0.22 s fades, and encoded to VP9 (CRF stepped until
≤ 330 KB) and H.264 high (CRF stepped until ≤ 400 KB, `+faststart`). The video has no audio track.

### ffmpeg

hshi-u1 has no system ffmpeg. The spec uses `$CT_FFMPEG`, else `ffmpeg` on PATH, else the static
build from the npm package `@ffmpeg-installer/linux-x64@4.1.0` already in
`~/clocktower/audio-scratch/tools/node_modules/` (see docs/audio.md). It is not a project dependency.

## Testing the tour

```
CT_AGENT=tutorial scripts/remote.sh pnpm exec playwright test -c tests/e2e/tutorial.config.ts --project intro
CT_AGENT=tutorial scripts/pull.sh docs/screenshots
```

The spec also runs under the main e2e config (`pnpm test:e2e`). `capture-tutorial.spec.ts`
skips itself there unless `CT_CAPTURE_TUTORIAL=1` is set.

This covers: the tour opening from How to play, clips playing from 'self', ≤ 2 clips requested
at a time, keyboard, dots, swipe, Esc, zero CSP violations and no console errors, a 390×844 phone
layout, reduced motion, and the bundle impact (no video in `dist/assets`, tour chunk < 25 KB).
The first-visit, Skip, "Watch the tour" and invite checks run once the landing screen mounts
`IntroHost`, and are skipped otherwise.
