# v2.2 performance plan (perf-audit, 2026-10-15)

Measured baseline on the v2.1 tree (working copy at 5e5142b + uncommitted auto-st work), on hshi-u1
(Ryzen 5 5500, 12 threads). Browser numbers use headless Chromium on the host's **real RTX 3060**
(ANGLE/Vulkan, `--gpu yes`); the default software renderer (SwiftShader) is reported separately as a
*no-GPU low-end proxy*. Every number below comes from a command listed in §5; nothing was estimated
unless marked *est.*

**One-line verdict:** the server is idle; the work is all on the client and the wire. In order of
user-visible impact: (1) **5.4 MB of PNG atlases** (3.6 MB `cast.png`) + a 270 KB-br entry chunk that
carries LiveKit before sign-in → ≈ 36 s (est. prod; 46 s measured uncompressed) to a playable
town on a Slow-4G phone profile; (2) the **world snapshot
stream** (13.7 KB/s per client, constant, 85–90 % removable); (3) the **town render loop / HUD churn**
on phones; (4) **voice downlink** (48 kbps Opus + RED, subscribed to inaudible people).

---

## 0. Ranked summary

| # | Package | Owner | Main gain (measured → target) | Effort |
|---|---|---|---|---|
| 1 | WP1 Asset pipeline | world-art | town atlases 5.4 MiB → ≈ 0.8 MiB; ≈ −23 s to a playable town on Slow 4G | S–M |
| 2 | WP3 Entry split + HUD churn | lead (+ rules-storyteller for ui/hud) | entry 270 → ≤ 110 KiB br; walking DOM churn 40 → ≤ 5 mutations/s | M |
| 3 | WP5 Voice | voice | −125 KiB br before sign-in (LiveKit lazy); uplink −50 %; no downlink for out-of-range talkers | M |
| 4 | WP4 Snapshots on the wire | world-art + lead | 13.7 → ≈ 2 KB/s per client (−85–90 %) | M–L (protocol + secrecy tests) |
| 5 | WP2 Render loop + low tier | world-art | phone main thread 33 % → ≈ 15–18 %; no-GPU 17 → ≥ 30 fps | M |
| 6 | WP6 HTTP caching + deploy | lead + qa-deploy | repeat visits ≈ 0 bytes; no broken chunks after deploys | S |
| 7 | WP7 Perf budgets | perf-audit / qa-deploy | regressions caught per release | S |

WP1, WP3, WP5, WP6 and WP7 can start immediately in parallel; WP2 and WP4 touch the hot paths and
should land one at a time with the full e2e set (`v2-look`, `v2-phone`, `v2-social`, `v21-clock`).

---

## 1. Findings (metric · measured · target)

### 1.1 Load

| Metric | Measured | Target v2.2 |
|---|---|---|
| Entry chunk `index-*.js` (loaded before sign-in) | 1127 KiB raw · 324 gz · **270 KiB br** | ≤ 110 KiB br |
| …of which `livekit-client` (isolated, min) | 571 KiB min · 149 gz · **125 br** — ~45 % of entry | 0 before sign-in (lazy on "Enable voice") |
| …of which Storyteller UI / admin UI / colyseus schema / zod (pre-minify share) | 150 / 45 / 234 / 238 KiB src | ST + admin lazy; zod not in client runtime |
| Town chunk `TownGame-*.js` (Phaser 3.90) | 1256 KiB raw · 350 gz · **282 KiB br** (Phaser alone 260 br) | unchanged (prefetch while in lobby) |
| CSS `index-*.css` | 129 KiB raw · 27 gz · 23 br (incl. @font-face for 5 unused scripts) | ≤ 15 KiB br |
| `cast.png` 1280×3520 RGBA, 10 525 colours | **3588 KiB** shipped | **364 KiB** WebP-lossless (−90 %), 830 KiB re-optimised PNG |
| `terrain.png` 1024×800 | **1373 KiB** | 299 KiB WebP-lossless (−78 %) |
| `objects.png` 1024×368 | 353 KiB | 76 KiB WebP-lossless |
| social / square-props / lights | 22 / 41 / 19 KiB | 6 / 12 / 5 KiB |
| All town atlases | **5.4 MiB** | **≈ 0.8 MiB** |
| GPU texture memory (atlases, RGBA8) | cast 17.2 MiB + terrain 3.1 + objects 1.4 + … ≈ **22 MiB** | ≤ 12 MiB (trim cast sheet: 88 blocks, many unused per game) |
| Character picker before sign-up | pulls the full 3.6 MB `cast.png` to draw 13 portraits | ≤ 30 KiB portrait strip |
| Cache headers, hashed `/assets/*` | origin `max-age=3600`; Cloudflare rewrites to `max-age=14400` (4 h) | `max-age=31536000, immutable` (CF keeps the longer origin TTL) |
| Missing `/assets/x.js` | **200 text/html** (SPA fallback) — cached 4 h by CF; old tabs then fail "The town failed to load" after a deploy | 404, and keep the previous build's assets for one deploy |
| Compression | origin none (express.static); Cloudflare serves br for js/css (entry 1 046 934 → 298 516 B) | fine as is (br at edge) |
| Time to playable town, phone profile (Slow 4G + 4× CPU) | 46 s locally (uncompressed JS), **≈ 36 s est. prod** — §1.2a | ≤ 10 s |
| Time to auth screen, same profile | 7.2 s locally, ≈ 3 s est. prod | ≤ 2 s |

### 1.2 Client runtime

Scenario: lobby with a human-Storyteller bot + 14 wandering player bots + the browser as the 15th
player, by day outdoors (all 16 avatars visible), voice coordinator on (no LiveKit connection).
Headless Chromium on hshi-u1 with the **real RTX 3060** (`--gpu yes`: ANGLE/Vulkan) unless noted;
"phone" = 390×844 viewport + CDP CPU throttling 4×. `main-thread %` = CDP `TaskDuration`/s,
`script %` = `ScriptDuration`/s.

| Metric | Measured | Target |
|---|---|---|
| Desktop 1440×900, standing | 60 fps, frame p95 16.7 ms; main thread **8.1 %**, script 7.1 %; DOM mutations 0.1/s | — |
| Desktop, walking (WASD) | 60 fps; main 11 %, script 7.2 %; **style recalcs 37.5/s, DOM mutations 39.8/s, layouts 3.5/s** (idle: 0.1/0.1/0.1) | ≤ 5 / ≤ 5 / ≤ 1 per s |
| Phone profile, walking | 60 fps (GPU-backed), main **32.8 %**, script **22 %**, style recalcs 59.8/s, DOM mutations 69.4/s; 2 frames > 33 ms (max 217 ms) | main ≤ 15 %, no frame > 50 ms |
| Night, inside own home | 60 fps; main 6.3 %, script 4.9 % | — |
| **No-GPU proxy** (SwiftShader), desktop 1440×900 standing | **16.9 fps**, every frame a 67 ms long task (fill-rate bound; script only 2.3 %) | ≥ 30 fps via render-scale on low tier |
| No-GPU proxy, phone profile walking | 30 fps, frame p99 50 ms | ≥ 30 fps steady |
| JS CPU profile, phone walking (20.7 s, 6.6 s busy) | Phaser `Game.step` 3068 ms → `WebGLRenderer.render` 2510 ms (batchSprite/batchTexture 1 s, tilemap layers 283 ms, `sortByDepth`+`StableSort` 256 ms, `RunCull` 175 ms); `TownScene.update` **989 ms of which `updateLighting` 675 ms (68 %)**; stepAmbience 115, stepLocal 76, stepRemotes 60, drawTownClock / gameplay / social < 10 ms each; GC 83 ms | update ≤ 300 ms; render −30 % |
| Display objects | tilemap 107×37 × 2 layers + **292 static images** (231 props, 45 flat, 16 buildings) + 16 avatars + 16 labels + NPCs/pigeons/fireflies/smoke; **161 light sources** iterated and stamped every frame | static ground+flat baked; lights only re-stamped on change |
| Depth sort | `Avatar.setPose` / NPCs call `setDepth(10+y)` **every frame even when unchanged** → Phaser re-sorts the whole display list (~400 objects) each frame | sort only on change |
| Label text re-renders | `setAppearance` → `label.setColor()` unconditionally on every lobby/game view for all avatars (each = canvas redraw + texture upload); `fitCamera` 3 re-renders per label | only on change |
| JS heap | 20–26 MB used; **after-GC heap flat 17.3–18.1 MB over 6 × 60 s walking** (no leak); churn 2–4 MB/min | — |
| GPU textures | atlases ≈ 22 MiB (see §1.1); canvas = CSS px (Phaser resolution 1), so DPR does not multiply fill | — |
| Frame cap | none — follows display refresh (120 Hz phones render 120 fps) | 60 / 30 (low tier) |

**(a) Cold load, phone profile** (Slow 4G 150 ms RTT / 1.6 Mbit/s down + 4× CPU, cache disabled,
prod build on the local test server — which sends JS/CSS **uncompressed**; Cloudflare's br would cut
script bytes ≈ 4×, so the *est. prod* column subtracts that difference at 1.6 Mbit/s):

| Stage | Measured locally | est. prod (br) | Bytes (local) |
|---|---|---|---|
| Auth screen visible | 7.2 s (load event 9.9 s) | ≈ 3 s | JS 1.17 MB (br ≈ 0.27), CSS 139 KB, images 422 KB (hero-m.avif 151, fog.png 80, frame-px.png 70, logo 45), fonts 169 KB |
| Town canvas created (TownGame chunk loaded) | 15.2 s | ≈ 8 s | + TownGame.js 1.29 MB (br ≈ 0.28) |
| Town fully loaded (network idle) | **46.3 s** | **≈ 36 s** | atlases via XHR **5.70 MB** (cast 3.67, terrain 1.41, objects 0.36, town.json 0.17, square-props 0.04) |

After WP1 + WP3 + WP5 (*est.*): auth ≈ 1.5–2 s, town ≈ 8–10 s on the same profile.

### 1.3 Network (1 lobby: human ST bot + 15 players, all wandering at 10 Hz, voice coordinator on)

| Metric | Measured | Target |
|---|---|---|
| S2C per client, day walk | **13.7 KB/s** (109 kbit/s) — 99.7 % `world:snapshot` | ≤ 2.5 KB/s |
| `world:snapshot` | 12 /s × **1141 B** msgpack (1487 B JSON), 15.5 entities ≈ 71 B/entity | ≈ 170 B quantised, ≈ 112 B quantised + skip-unchanged |
| Entities unchanged since previous snapshot | 36 % (bots pause 30 % of the time; humans in the circle stand still far more) | not sent |
| Snapshot cadence | 12 Hz average but **jittery 50/100 ms** (20 Hz tick, `acc %= 83.3`) | steady 10 or 12 Hz |
| `game:view` (Storyteller) | 10.3–10.7 KB msgpack each (grimoire 5.4 KB JSON, nightQueue 3.3 KB); 0.4 /s while a vote runs → 4.5 KB/s for the ST | ≤ 1.5 KB/s (patches) |
| `game:view` (player) | 2.6 KB msgpack (players 2.3 KB JSON); 0.4 /s during votes → 1.1 KB/s | ≤ 0.4 KB/s |
| `game:view` in a quiet day | 1 per 40 s (dirty detection works) | — |
| C2S per client | 0.4 KB/s (`move` 15 Hz) | fine |
| Earlier load test (qa-deploy, 4 × 16 clients) | 13.6 KB/s per client, 0.87 MB/s outbound total | — |

### 1.4 Server

| Metric | Measured | Target |
|---|---|---|
| Server CPU, 16 clients, day walk (`/proc`) | **4.7–7.5 % of one core** (p95 9 %), RSS 264–295 MB (tsx source mode) | no work needed |
| Main-thread JS (V8 profile, 84 s) | 1.95 s busy = 2.3 % of a core; GC 85 ms | — |
| Share of GameRoom.tick in snapshot fan-out | `sendSnapshots` 508 of 557 ms (**91 %**) = msgpack `pack` + ws `send` per viewer | encode shared part once |
| `snapshotFor` / `pinsFor` / `doorTags` | 47 / 5 / 6 ms per 84 s | — |
| `flushViews` (viewFor + JSON.stringify de-dup) | 43 ms per 84 s | — |
| `game.viewFor` (15-seat auto games, 132 870 calls) | **3 µs** avg | — |
| Flush of 15 viewers incl. `JSON.stringify` | 394 µs avg, 111 KB stringified per flush | memo by state revision (optional) |
| `recorder.observe` (state diff per commit, 3221 commits) | **41 µs** avg, 0.44 ms max | no work needed |
| `game.tick` (auto ST + rules) | 60 µs avg, **24 ms max** (one spike) | investigate the spike only |
| `stageView` JSON every tick | only while a seat override exists; 1 ms total | — |
| Voice coordinator tick | 2 ms per 84 s | — |
| Prod processes now | 2 × node (137 / 108 MB RSS, 0.1 % CPU), cloudflared 0.2 % | — |

### 1.5 Voice (code review, LiveKit 2.22.4; not measurable without a LiveKit server)

| Item | Current | Target |
|---|---|---|
| Publish preset | default `AudioPresets.music` = **48 kbps** Opus, `dtx: true`, `red: true` (RED ≈ doubles packets while talking) | `speech` 24 kbps; RED only when packet loss is reported |
| Subscriptions | `autoSubscribe: true` to everyone in the zone; proximity gain 0 beyond 10 tiles but the stream is still received + decoded (town is 45 tiles wide) | unsubscribe beyond `silentTiles + 2` with hysteresis |
| `adaptiveStream` / `dynacast` | false / false — irrelevant (no video) | leave |
| UI churn | `patch({participants})` every 200 ms unconditionally → VoicePanel re-renders at 5 Hz while connected | patch only on change |
| VAD | `AnalyserNode` fft 1024 read every 50 ms (gain tick) | fine; skip when not enabled |
| Reconnect | exponential 1→16 s, max 15 s; token TTL 600 s | fine |

---

## 2. Work packages

Seven packages, ranked by user-visible gain per effort. **Owner globs do not overlap**; where a
package needs a one-line change in another package's file it is listed under *hand-off* and done by
that file's owner (or by the lead). Every package measures before/after with the scripts in
`scripts/perf/**` / `tests/perf/**` (owned by perf-audit; packages may add flags but not change the
default scenarios, so numbers stay comparable).

### WP1 — Asset pipeline: lossless WebP atlases, slim portrait strip, trimmed cast sheet  *(owner: world-art)*

- **Files:** `packages/assets/**` (generator `scripts/generate.ts`, `generated/*`, `src/**`).
- **Do:**
  1. Emit every runtime atlas as **WebP lossless** (`cwebp -lossless -z 9` or sharp) next to a
     re-optimised PNG fallback (zlib 9 + adaptive filters; `cast.png` 3588 → 830 KiB even as PNG).
     WebP-lossless decodes in all current browsers (Safari ≥ 14 / iOS 14); keep the PNG fallback for
     anything older; lossy WebP is
     *bigger* than lossless for this pixel art (cast q90 = 1525 KiB) and smears pixels — don't.
  2. Export format-agnostic URLs from one module, e.g. `@ct/assets/runtime` →
     `{ castUrl, terrainUrl, objectsUrl, decorUrl, lightsUrl, squarePropsUrl, socialUrl, townJsonUrl }`.
  3. Generate a **portrait strip** (`cast-portraits.webp`: one idle-down 32×40 frame per playable
     character + ghost variants, ≈ 15–25 KiB) for the DOM UI (character picker, waiting room,
     notebook, social palette, ST script) so sign-up never downloads the 3.6 MB game sheet.
  4. Trim `cast.png`: 88 sheet blocks (1280×3520 = 17.2 MiB of GPU memory) — drop unused direction
     duplicates / pad, or split into `cast-players` + `cast-npc` so NPCs (daytime only) and ghost
     variants load on demand. Target ≤ 8 MiB GPU.
- **Hand-off (1 line each):** `apps/client/src/game/TownScene.ts` import lines 21–27 + `FX_PNG`
  glob → WP2 owner swaps to `@ct/assets/runtime`; `apps/client/src/ui/common/castPortrait.ts`
  (lead) switches its glob to the portrait strip.
- **Expected:** town atlases 5.4 MiB → ≈ 0.8 MiB (−85 %); on Slow 4G (1.6 Mbit/s) that alone is
  ≈ 23 s less to a playable town; sign-up page −3.6 MB.
- **Measure:** `python3 scripts/perf/image-encode.py packages/assets/generated/*.png` (sizes, GPU
  bytes) and `node scripts/perf/bundle-report.mjs` (dist totals by type); load windows of
  `tests/perf/client-perf.ts --only load`. Pixel-exact check: decode WebP and compare RGBA with the
  PNG (add to `packages/assets/test`).
- **Risks:** colour-exactness (lossless is exact; verify), Safari < 14 needs the PNG fallback,
  generator determinism (pin the encoder version). No secrecy surface (public art).

### WP2 — Town render loop + mobile quality tier  *(owner: world-art)*

- **Files:** `apps/client/src/game/**` **except** `GameScreen.tsx` and `game/sound/**`.
- **Do (ordered by measured cost, §1.2 phone profile):**
  1. **Lighting (675 ms of the 989 ms `TownScene.update`):** `updateLighting` clears + fills the
     multiply RenderTexture and walks all 161 light sources with a `flicker()` (2 × `Math.sin`) per
     stamp every frame. Pre-filter lights per location once (on location change), re-stamp only when
     an input changed (ambient lerp still moving, a carried light moved ≥ 1 px) and step the flicker
     at 12 Hz instead of 60.
  2. **Depth sort:** `Avatar.setPose` and the NPC loop call `setDepth(10 + y)` every frame even
     when `y` did not change, which makes Phaser stable-sort the whole display list (~400 objects:
     `sortByDepth` + `StableSort` = 256 ms per 20 s on the phone profile). Only set depth on change.
  3. **Static batch:** 292 static images (231 props, 45 flat, 16 buildings) + two 107×37 tile layers
     are culled and batched every frame (`batchSprite`/`batchTexture` ≈ 1 s, `RunCull` 175 ms,
     tilemap 283 ms per 20 s). Bake ground + decor + `flat` objects into one static texture (or a
     Phaser `Blitter`/single RenderTexture) once per location; keep only y-sorted props/buildings as
     sprites.
  4. **Frame cap + low tier:** `fps: { limit: 60 }`; low tier (touch / `hardwareConcurrency ≤ 4` /
     a measured frame p95 > 33 ms for 5 s) → 30 fps, render scale 0.75 (canvas at 75 % CSS px,
     CSS-upscaled with `image-rendering: pixelated` — the no-GPU proxy is fill-rate bound: 16.9 fps
     at 1440×900), fewer fireflies/NPCs/pigeons, no chimney smoke.
  5. **Text:** `Avatar.setAppearance` calls `label.setColor()` unconditionally → canvas redraw +
     texture upload for every avatar on every lobby/game view; `fitCamera` does setResolution +
     setFontSize + setStroke (3 redraws). Guard on change; one `setStyle`.
  6. **Graphics redraws:** `drawTownClock` (changes ≤ 1×/s), gameplay `ground/hands/hints` and
     social `gGround/gUp` clear + redraw every frame; cheap today (< 10 ms / 20 s each) but redraw on
     change / at 15 Hz for pulses once 1–3 are done.
  7. **Allocations:** `remoteEntities.set(pid, {…})` per avatar per frame, `spotsFor()` sort + join
     per call, `performance.now()` per avatar in `stepRemotes`, a sprite + tween per chimney puff per
     second → mutate in place / pool (churn 2–4 MB/min today, no leak).
  8. **localPlayer publish** (every frame while walking): publish at ≤ 10 Hz or on location change;
     per-frame consumers (voice gains 20 Hz, gameplay) read `localPlayer.get()` directly. This is
     the producer half of WP3's HUD fix.
- **Hand-off:** WP1's import swap (lines 21–27) lands here.
- **Expected:** `TownScene.update` 989 → ≤ 300 ms per 20 s and render −30 % on the phone profile
  (main thread 33 % → ≈ 15–18 %); no-GPU proxy ≥ 30 fps at 1440×900 on the low tier; half the GPU
  work at 30 fps (battery).
- **Measure:** `tests/perf/client-perf.ts` windows `desktop-idle`, `desktop-walk`, `mobile-walk`,
  `night-home` (fps, frame p95/p99, main-thread %, script %, heap delta) + the CPU profile
  (`--profile yes --dist /tmp/ct-perf/dist-nomin`, summarised with `tests/perf/cpuprofile-summary.ts
  --focus update,updateLighting,drawTownClock,stepRemotes,stepAmbience,layoutPins,drawEmotes`).
- **Risks:** visual regressions (run `v2-look`, `v2-phone`, `v21-clock` e2e + screenshots); the
  lighting cache must still show the visiting Storyteller's lantern only where the viewer sees it
  (it only uses already-visible avatars — keep it that way).

### WP3 — Entry bundle split + HUD render churn  *(owner: lead, with rules-storyteller for ui/hud)*

- **Files:** `apps/client/src/main.tsx`, `apps/client/vite.config.ts`, `apps/client/index.html`,
  `apps/client/src/net/store.ts`, `apps/client/src/game/GameScreen.tsx`,
  `apps/client/src/ui/common/**` (except `castPortrait.ts`, WP1 hand-off), `apps/client/src/ui/hud/**`,
  `apps/client/src/ui/storyteller/index.tsx` (lazy boundary only), `packages/protocol/src/index.ts`
  (add a schema-free entry, see 3).
- **Do:**
  1. `main.tsx`: lazy-load everything after sign-in: `LobbyRoute` (pulls colyseus.js +
     @colyseus/schema + msgpackr ≈ 365 KiB src), `AdminScreen`, `StorytellerPanel` (150 KiB src —
     players never need it), `ChatPanel`, `Hud`. Auth/home stays in the entry.
  2. Prefetch: once on the home screen, `<link rel="modulepreload">` the lobby chunk; once in a lobby
     (waiting room), start fetching `TownGame` + the atlases (`new Image().src = …`) so the town is
     warm when the game starts.
  3. Zod: the client never validates (no `.parse` in apps/client) but the `C2S` schema map pulls
     zod (238 KiB src) into the entry. Add `@ct/protocol/client` (types + constants + pure helpers, no
     zod) and import that from the client.
  4. Fonts: import only the latin + latin-ext subsets of the two @fontsource families (CSS −60 %),
     `font-display: swap` + preload the two latin woff2 used above the fold.
  5. HUD: `useStore(localPlayer)` in `HomeCompass` / `FirstSteps` re-renders on every published
     frame while walking — measured **37.5 style recalcs/s, 39.8 DOM mutations/s, 3.5 layouts/s**
     on desktop and 59.8 / 69.4 / 6.4 on the phone profile, vs 0.1/s standing. Add `useStoreSelector(store, fn, eq)` to `net/store.ts` and derive
     `{steps, deg rounded to 5°, location}`; same for `conn.gameView` consumers that only need
     `phase`/`clock`.
  6. Clock UI: `ClockChip` / `StClock` tick with `setInterval` at 500 ms–1 s — keep, but render only
     the text node (memo the rest).
- **Hand-off:** livekit lazy-load is WP5 (VoiceClient), so WP3 only needs `VoicePanel` to stay cheap
  to import.
- **Expected:** entry 270 → ≤ 110 KiB br (*est.*: −125 livekit (WP5) −35 colyseus −25 ST UI −15 zod
  −8 admin); auth screen interactive ≈ 2× sooner on the phone profile; DOM mutations/s while walking
  → near the idle level.
- **Measure:** `node scripts/perf/bundle-report.mjs` (per-chunk composition, gz/br), `bash
  scripts/perf/dep-cost.sh`, client-perf `load` (auth screen ms, bytes by type) and
  `desktop-walk`/`mobile-walk` (`domMutationsPerSec`, `styleRecalcsPerSec`, `layoutsPerSec`).
- **Risks:** CSP is `script-src 'self'` — dynamic chunks are same-origin, fine; old-tab chunk 404s
  after deploys (WP6 fixes); the `@ct/protocol/client` entry must not re-export anything that pulls
  server-only modules.

### WP4 — World snapshots on the wire: quantised arrays, skip-unchanged, steady cadence  *(owner: world-art + lead for protocol/GameRoom)*

- **Files:** `packages/protocol/src/world.ts` + new `packages/protocol/src/snapshotCodec.ts`,
  `apps/server/src/world/**`, `apps/server/src/rooms/GameRoom.ts` (`sendSnapshots` + tick
  accumulator only), `apps/client/src/net/room.ts` (decode → the same `WorldSnapshot` object, so
  `TownScene.onSnapshot` does not change).
- **Do:**
  1. Compact encoding (additive message `world:snap2`, behind a capability flag sent in the join
     options; old clients keep `world:snapshot` for one release): per entity
     `[idx, x·10 (uint16), y·10, facing·2+moving, locIdx]`; `idx` = per-lobby entity index
     announced in a small `world:index` message whenever membership changes (pid list), `locIdx`
     from a fixed table (`outdoors` + building ids from the layout). Measured: **1141 → 170 B**.
  2. Skip unchanged entities (per viewer: last sent tuple per entity) with a **full keyframe every
     1 s** and on any visibility change; the client keeps the last state for omitted ids. Measured:
     **→ 112 B** (36 % unchanged with bots; humans idle more).
  3. Idle rate: when *no* entity visible to a viewer changed, send only a keepalive at 2 Hz
     (`[t, ackSeq]`) — the client's dead-feed watchdog (`net/room.ts`, 5 s) stays satisfied.
  4. Steady cadence: snapshot every 2nd tick at 10 Hz (or tick 24 Hz → 12 Hz) instead of the
     50/100 ms jitter from `snapshotAcc %= 83.3`; INTERP_DELAY_MS (110) stays valid.
  5. Encode the shared outdoors entity list once per tick and append per-viewer fields
     (`ackSeq`, `you`, `pins`) — removes most of the 91 % of tick time spent in `pack` + `send`.
- **Expected:** 13.7 → ≈ 1.5–2.5 KB/s per client (−85–90 %); with 16 clients and several lobbies
  the outbound tunnel traffic drops by the same ratio; fewer radio wake-ups on phones.
- **Measure:** `tests/perf/server-profile.ts` (per-type bytes/s per client, avg/max msgpack size,
  `snapshot what-if` line, server CPU, V8 profile → `cpuprofile-summary.ts`); `tests/load/run.ts`
  for multi-lobby totals.
- **Risks (secrecy!):** visibility is decided by `snapshotFor(pid)` **before** encoding — the codec
  must only encode that per-viewer list; the shared-encoding optimisation (5) may share only the
  list for viewers whose visibility rule yields the *identical* set (outdoors, non-night), never
  across night/home/Storyteller views. The entity index must not leak who exists in other locations:
  announce index entries only for entities the viewer has been sent (or for lobby members, which are
  public anyway — confirm with `world.leaks.test.ts` and the playtest secrecy scanner, which must be
  extended to decode `world:snap2`). Delta state is per viewer and reset on reconnect.

### WP5 — Voice: lazy LiveKit, speech preset, proximity subscription culling  *(owner: voice)*

- **Files:** `apps/client/src/voice/**`, `apps/client/src/ui/voice/**`, `packages/voice/**`.
- **Do:**
  1. Split `VoiceClient.ts` so `livekit-client` is `import()`ed on "Enable voice" (it is ~45 % of the
     entry chunk: 125 KiB br). The panel and the `voiceActivity`/`voicePresence` stores stay in a
     tiny static module.
  2. Publish with `audioPreset: AudioPresets.speech` (24 kbps) — currently the default `music`
     48 kbps; keep `dtx`; make `red` conditional (enable when `getStats` shows > 2 % loss).
  3. Proximity culling: `setSubscribed(false)` for participants whose gain target has been 0 for
     > 2 s (beyond `silentTiles` + 2 tiles hysteresis), resubscribe when they come within
     `silentTiles` (gain fades in from 0 as today). Saves downlink and Opus decode per far talker.
  4. `refreshParticipants`: patch the state only when the list changed (gain rounded to 0.05) —
     today a new state object every 200 ms → VoicePanel re-renders 5×/s.
- **Expected:** −125 KiB br before sign-in; uplink per talker ≈ −50 % (48→24 kbps, RED off);
  downlink with N talkers out of range → 0 instead of N × (24–96) kbps.
- **Measure:** bundle-report (entry composition), a live LiveKit session with `room.engine` stats
  (`getStats` inbound/outbound bitrate) in the existing `voice-live.spec.ts` (needs real LiveKit
  credentials — voice owner), DOM mutations/s with voice enabled.
- **Risks:** subscription culling must never subscribe to anyone the server's grant does not allow
  (grants stay server-side per pid — culling only *removes* subscriptions); resubscribe latency
  (~300 ms) when walking up to a group — keep hysteresis generous.

### WP6 — HTTP caching + deploy safety  *(owner: lead for app.ts, qa-deploy for scripts)*

- **Files:** `apps/server/src/app.ts` (static section only), `scripts/deploy-hshi-u1.sh`,
  `docs/deployment.md`.
- **Do:**
  1. `/assets/*` (content-hashed): `Cache-Control: public, max-age=31536000, immutable`
     (Cloudflare keeps the origin TTL when it is longer than its 4 h Browser-Cache-TTL).
  2. Unhashed `public/` files (`/landing`, `/audio`, `/tutorial`, `/art`): `max-age=86400,
     stale-while-revalidate=604800`; ideally hash them (WP3 vite config could move them to
     imports later).
  3. SPA fallback only for navigations (`Accept: text/html`, no file extension); **404** for
     `/assets/*` and other files — today a missing chunk is answered with `index.html` (200) and
     Cloudflare caches that for 4 h.
  4. Deploy keeps the previous release's `dist/assets/*` for one release so open tabs can still
     lazy-load their `TownGame-<oldhash>.js`.
  5. (optional) precompressed `.br` siblings at build time + `express-static-gzip` is **not** needed:
     Cloudflare already serves br; skip.
- **Expected:** repeat visits load 0 bytes of JS/CSS/atlases instead of revalidating every 4 h;
  no "town failed to load" after deploys.
- **Measure:** `curl -sI --resolve … https://clocktower.chrisshi.com/assets/<file>` (cache-control,
  cf-cache-status) — commands in §5; client-perf `load` warm run (cache enabled) bytes.
- **Risks:** none for secrecy (static public files only). Never cache `/api/*` or `/healthz`.

### WP7 — Perf budgets in CI + session soak  *(owner: perf-audit / qa-deploy)*

- **Files:** `tests/perf/**`, `scripts/perf/**`, `docs/test-results.md` (qa-deploy).
- **Do:** turn the measurements into budgets checked on every release candidate: entry chunk br,
  town atlas bytes, snapshot bytes/s per client, server CPU per 16 clients, `desktop-walk` frame p95
  + script %, heap growth over a 20-minute walk (`client-perf.ts --only memory --memwin 60 --win 20`);
  JSON results under `tests/perf/results/`.
- **Expected:** regressions caught before release; each WP's before/after recorded in one place.
- **Risks:** host noise (shared with prod) — budgets with 20 % slack, run sequentially, one browser.

---

## 3. Secrecy guard rails for every package

- Per-viewer projections stay per-viewer: `viewFor(pid)`, `snapshotFor(pid)`, `pinsFor(pid)` run
  **before** any caching/encoding. A cache key is always `(pid, revision)` — never share a computed
  view between two pids unless the projection function is proven viewer-independent for that input
  (only the outdoors/day entity list qualifies; night, home, Storyteller and pins never do).
- Delta/skip-unchanged state is kept per connection and reset on reconnect; a keyframe re-sends only
  what that viewer may see.
- Entity indices (WP4) must not reveal entities the viewer was never sent; reuse the lobby member
  list (public) or index lazily on first send.
- Client-side optimisations (WP2/WP3/WP5) must not move any decision to the client that the server
  enforces today (visibility, door access, voice grants). Voice culling only ever *drops*
  subscriptions.
- Before merging WP4: `apps/server/test/world.leaks.test.ts`, `playtest*.test.ts` (secrecy scanner
  must decode the new message), `tests/security/**`, `v2-social` e2e.

## 4. Things measured and found *not* worth doing

- **Server tick / view projection caching (as a separate package):** the whole server uses
  4.7–7.5 % of one core for a full 16-client lobby; `viewFor` costs 3 µs, a 15-viewer flush with
  JSON de-dup 0.4 ms, and in a quiet day the views are re-sent once per ~40 s. The only server cost
  that matters is snapshot fan-out, which WP4 covers. A `(pid, stateRevision)` memo in
  `flushViews` is a fine follow-up if multiple busy lobbies ever show up in `tests/load`.
- **Records / recorder overhead:** `recorder.observe` (full state diff per commit) averages 41 µs,
  max 0.44 ms, over 3221 commits of four 15-seat games — leave it.
- **SQLite writes:** none on the tick path (writes happen on auth, notebook save, voice heartbeats
  every 30 s, game end). Not measurable in the profile (better-sqlite3 13 ms / 84 s incl. setup).
- **Origin compression:** Cloudflare already serves brotli (entry JS 1 046 934 → 298 516 B on the
  wire). Adding compression in express would only save tunnel bandwidth.
- **Tutorial clips (4.9 MB):** already lazy (IntroTour chunk, `preload="metadata"`), never on the
  critical path.
- **GC on the server:** 85 ms per 84 s.
- **One `game.tick` spike of 24 ms** (vs 60 µs avg) in the auto-game bench — worth a look by
  auto-st, but it is a single event per game, not a throughput issue.

## 5. Commands run (all on hshi-u1 via `scripts/remote.sh`, CT_AGENT=perf-audit)

All scripts are new, owned by perf-audit, and change no product code. Results land in `/tmp/ct-perf*` on
hshi-u1 (JSON + `.cpuprofile`).

| What | Command | Result |
|---|---|---|
| Prod client build | `CT_AGENT=perf-audit scripts/remote.sh bash -c 'pnpm --filter @ct/client build; find apps/client/dist -type f -printf "%s %p\n" \| sort -n'` | ok, 18 MB dist |
| Bundle composition (per chunk raw/gz/br + top packages + asset totals) | `CT_AGENT=perf-audit scripts/remote.sh node scripts/perf/bundle-report.mjs --json /tmp/ct-perf-bundle.json` | §1.1 |
| Isolated dependency cost | `CT_AGENT=perf-audit scripts/remote.sh bash scripts/perf/dep-cost.sh` | livekit 571/149/125, phaser 1187/322/260, colyseus.js 124/40/35, preact 11.5/4.8/4.4 KiB (min/gz/br); zod failed to resolve from apps/client (pulled via @ct/protocol) |
| Atlas re-encoding | `CT_AGENT=perf-audit scripts/remote.sh python3 scripts/perf/image-encode.py packages/assets/generated/{cast,terrain,objects,social,square-props,lights,characters}.png` | §1.1 |
| Edge headers / compression | `curl -s -o /dev/null -D - --resolve clocktower.chrisshi.com:443:104.21.86.146 -H 'Accept-Encoding: br, gzip' https://clocktower.chrisshi.com/assets/index-CSUlKzIO.js` (+ identity, + css, + a missing `/assets/*.png`) | br at edge; `max-age=14400`; missing asset → 200 text/html |
| Server + network profile, 1 ST + 15 players, voice coordinator on | `CT_AGENT=perf-audit scripts/remote.sh pnpm exec tsx tests/perf/server-profile.ts --players 15 --walk 40 --out /tmp/ct-perf` (run 3×; first run failed at the vote phase — 15-seat clockwise vote outlasts the helper's 40 s tally wait — fixed with a bounded `--vote` window) | §1.3, §1.4 |
| V8 profile summary | `pnpm exec tsx tests/perf/cpuprofile-summary.ts /tmp/ct-perf/cpuprof/CPU.*.cpuprofile --top 45` | §1.4 |
| Snapshot what-if (quantised / skip-unchanged) | `… server-profile.ts --players 15 --walk 30 --vote 20 --out /tmp/ct-perf2` | 1107 → 170 → 112 B, 36 % unchanged |
| Game-module micro-bench (4 auto games, 15 seats, real world module) | `CT_AGENT=perf-audit scripts/remote.sh pnpm exec tsx tests/perf/game-module-bench.ts --games 4 --players 15` | §1.4 |
| Typecheck of the perf scripts | `tsc -p` over `tests/perf/*.ts` + `tests/support/**` (temp tsconfig extending `tests/tsconfig.json`) | 0 errors |
| Unminified client for profiling | `cd apps/client && pnpm exec vite build --minify false --outDir /tmp/ct-perf/dist-nomin` | ok |
| Client runtime windows (GPU) + CPU profiles | `CT_AGENT=perf-audit scripts/remote.sh pnpm exec tsx tests/perf/client-perf.ts --dist /tmp/ct-perf/dist-nomin --win 20 --profile yes --gpu yes --only desktop-idle,desktop-walk,mobile-walk,night-home --out /tmp/ct-perf/client` (first attempt without `--gpu` and without the `__name` shim recorded 0 fps: tsx's keepNames helper broke the in-page probes — fixed) | §1.2 |
| Client profile summaries | `pnpm exec tsx tests/perf/cpuprofile-summary.ts /tmp/ct-perf/client/client-{desktop,mobile}-walk.cpuprofile --focus update,updateLighting,drawTownClock,stepRemotes,…` | §1.2 |
| Cold load, phone profile | `… client-perf.ts --dist apps/client/dist --gpu yes --only load --out /tmp/ct-perf/load` | §1.2a |
| Memory, 6 × 60 s walking | `… client-perf.ts --dist apps/client/dist --gpu yes --win 60 --memwin 6 --only memory --out /tmp/ct-perf/mem` | flat 17.3–18.1 MB after GC |
| No-GPU proxy | `… client-perf.ts --dist apps/client/dist --gpu no --win 10 --profile no --only desktop-idle,mobile-walk --out /tmp/ct-perf/swiftshader` | 16.9 / 30 fps |

Browser runs were started only after the release e2e gate (`/tmp/ct-cand2-e2e.log` EXIT=1, no
`[p]laywright test` process, stable for 2 min), one headless Chromium at a time, own server on
127.0.0.1:3390-3394.
Existing qa-deploy load results used for cross-checking: `tests/load/results/2026-10-15T00-25-30-4x15p-120s.md`
(13.6 KB/s per client, 4.9 % CPU for 64 clients) and `soak-2026-10-15T01-32-29-30m.md` (no server leak).
