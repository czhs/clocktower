# Pre-sign-in tour ("Watch the tour")

A short, skippable tour shown before sign-in: 7 cards (4 for invite links), each a looping, muted
clip of **real gameplay** with a one-line caption. The footage is recorded by a script, so it can
be refreshed with one command whenever the art or UI changes.

| Piece | Where |
|---|---|
| Tour UI (Preact) | `apps/client/src/ui/intro/` (`IntroTour`, `IntroHost`, `WatchTourLink`, `openIntro`, `shouldAutoShowIntro`, `markIntroSeen`) |
| Card copy (title + 1-2 lines per clip) | `apps/client/src/ui/intro/cards.ts` |
| Footage + manifest | `apps/client/public/tutorial/` (`<clip>.webm` VP9, `<clip>.mp4` H.264, `<clip>.webp|jpg` poster, `manifest.json`) |
| Capture script | `tests/e2e/capture-tutorial.spec.ts` + `tests/e2e/tutorial.config.ts` |
| UI checks | `tests/e2e/tutorial-intro.spec.ts` (screenshots: `docs/screenshots/tutorial-*.png`) |

## Current footage (recorded 2026-10-15 from `accfc2d`, the pre-overhaul art)

| Clip (card) | What it shows | Length | WebM (VP9) | MP4 (H.264) | Poster (WebP) | Capture fps |
|---|---|---|---|---|---|---|
| town (A town to wander) | Ada and Bram walk up a lane into the square, with friends by the clock tower | 7.4 s | 266 KB | 270 KB | 62 KB | 60 |
| talk (Talk to whoever is near) | square chat from the group, then a whisper in a side street | 8.5 s | 275 KB | 365 KB | 70 KB | 60 |
| inside (Step inside…) | walk to the tavern (door tag), step in, private chat | 8.0 s | 283 KB | 288 KB | 68 KB | 60 |
| night (At night, walk home…) | bell, neighbours hurry home past the lamps, door, night falls | 9.5 s | 288 KB | 330 KB | 45 KB | 60 |
| visit (The Storyteller visits…) | the Storyteller arrives, private-visit banner, Fortune Teller prompt answered | 8.5 s | 76 KB | 94 KB | 13 KB | 59 |
| vote (Gather, nominate, vote) | nomination, raised hands, clock hand, "your vote counted", then Bram as a ghost with 1 ghost vote | 8.5 s | 285 KB | 332 KB | 72 KB | 60 |
| storyteller (…runs the show) | panning over the Storyteller panel: night order with ✓ visited, seat circle, Grimoire | 8.3 s | 269 KB | 337 KB | 22 KB | 60 |

Total 4.0 MB on disk (both formats + posters). A browser downloads one format: ≈ 2.0 MB of
WebM for the whole tour, fetched one card at a time.

## Behaviour

- **First visit:** `IntroHost` opens the tour by itself once (localStorage `ct.intro.seen.v1`). With
  storage blocked it never auto-opens. Automation (`navigator.webdriver`) is opted out, so the tour
  never covers the sign-up form in other e2e specs. A spec opts back in with localStorage
  `ct.intro.autotest = '1'`.
- **Afterwards:** "What is this? ▶ Watch the tour" on the landing screen (`WatchTourLink` /
  `openIntro()`), and "▶ Watch the tour" in the How to play dialog. The dialog loads the tour on
  demand, on every screen.
- **Invite links** (`/lobby/<id>`): 4 cards (town, talk, visit, vote). "Join the game" is the main
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
3000/3001). It plays one scripted game, records the clips and writes `apps/client/public/tutorial/`.
The game is: Storyteller + Ada + Bram in Chromium, plus 5 protocol bots that walk, chat, nominate
and vote. Look at the result before committing. `test-results/tutorial-raw/verify/<clip>-{1,2,3}.jpg`
holds frames from each final clip, and `test-results/tutorial-raw/capture-log.txt` holds the log
(both on hshi-u1).

- The script is layout-agnostic: positions come from `townLayout` (square, clock tower, homes,
  tavern), so a new town layout needs no changes. If a scene fails, the log says which one. The
  other clips are still encoded, and a card without a clip shows its placeholder.
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
  The current footage was recorded this way, from `accfc2d` (the committed, pre-overhaul art).
- Re-encode only (no replay), e.g. after changing the size caps:
  `CT_TUTORIAL_ENCODE_ONLY=1 pnpm capture:tutorial`. Size caps: `CT_TUTORIAL_WEBM_MAX` /
  `CT_TUTORIAL_MP4_MAX` (bytes per clip; defaults 330 000 / 400 000).

### Rendering

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
