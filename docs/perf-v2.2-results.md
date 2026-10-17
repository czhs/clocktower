# v2.2 perf — measured results per work package

Each work package appends its own `## WPn` section (before → after, commands, caveats).

## WP5 — Voice: lazy LiveKit, speech preset, proximity culling (voice)

**Files:** `apps/client/src/voice/VoiceClient.ts` (now the small static half: stores, state,
prefs, grants received before voice is on), new `apps/client/src/voice/VoiceEngine.ts` (everything
that needs `livekit-client`, `import()`ed on "Enable voice" / on reload of a voice-enabled tab),
new `apps/client/src/voice/policy.ts` (pure: cull hysteresis, change-only patch, loss window),
`apps/client/src/ui/voice/index.tsx` ("Loading voice…" state, debug overlay shows `red` and
culled talkers), `packages/voice/src/constants.ts` (`cullMarginTiles: 2`, `cullDelayMs: 2000`),
new `apps/client/test/voice.policy.test.ts` (16 tests).

**Entry chunk** (`node scripts/perf/bundle-report.mjs`; before = clean export of e96883b in
sandbox `perf-wp5-base`, after = e96883b + only the WP5 files in sandbox `perf-wp5-iso`):

| chunk | before raw / gz / br (KiB) | after raw / gz / br (KiB) |
|---|---|---|
| `index-*.js` (entry) | 1136.3 / 327.3 / **272.4** | 566.4 / 177.5 / **150.8** (−121.6 br, −45 %) |
| `VoiceEngine-*.js` (new, lazy) | — | 574.1 / 151.2 / 125.8 (livekit-client 1110 KiB rendered + engine 35 KiB) |
| `voice/VoiceClient.ts` rendered in entry | 35.3 | 8.5 |

`livekit-client` no longer appears in the entry composition. The only static importer chain was
`main.tsx → ui/voice → voice/VoiceClient`; `game/sound/index.ts` imports `voice/VoiceClient`
dynamically for `voiceActivity` and gets the same small module (no change needed outside voice).

**Uplink:** publish options are now `audioPreset: AudioPresets.speech` (24 kbps, was the default
`music` 48 kbps), `dtx: true`, `red: false`. LiveKit 2.22.4 sends `disableRed` once in the AddTrack
request, so RED can't be toggled on a live track. Instead the engine reads `getSenderStats()`
every 5 s. Once the uplink has lost more than 2 % over at least 250 sent packets (about 5 s of
talking), it turns RED on for the rest of the session. It republishes the mic at the next moment
the player isn't transmitting, and every later room switch publishes with RED.
Expected: ≈ −50 % uplink bitrate per talker (48 → 24 kbps, and no RED redundancy on clean links).
Not measured live: that needs real LiveKit credentials (`voice-live.spec.ts`, skipped).

**Downlink (street rooms only):** a talker who has been beyond `silentTiles + 2` tiles (or not
outdoors with us / unknown position) for > 2 s is unsubscribed (`setSubscribed(false)`). They are
resubscribed as soon as they are within `silentTiles` again, where their gain is still ≈ 0, so the
existing fade-in from 0 is unchanged. Culling only drops subscriptions: `setSubscribed(true)` is
only called on microphone publications that this client culled itself. Square / private rooms
aren't culled, and anything culled is restored if the mode stops being proximity.

**UI churn:** `refreshParticipants` patches the store only when the participant list changed (gain
compared in 0.05 steps) or `heardBy` changed. Before, it built a new state object every 200 ms
while voice was on, so the VoicePanel re-rendered 5×/s even with nobody in the room.

**Commands run (hshi-u1):**
- `CT_AGENT=perf-wp5-base scripts/remote.sh --no-sync node scripts/perf/bundle-report.mjs` → before table (ok)
- `CT_AGENT=perf-wp5-iso scripts/remote.sh --no-sync pnpm -r --no-bail run typecheck` → all 7 projects Done (0 errors)
- `CT_AGENT=perf-wp5-iso scripts/remote.sh --no-sync pnpm vitest run apps/client/test/voice.policy.test.ts packages/voice apps/client/test/sound.engine.test.ts` → 4 files, 60 tests passed
- `CT_AGENT=perf-wp5-iso scripts/remote.sh --no-sync node scripts/perf/bundle-report.mjs` → after table (ok)
- Full shared tree (`CT_AGENT=perf-wp5`): voice tests pass (46). Typecheck fails only in other packages' in-progress files (`packages/protocol/src/snapshotCodec.ts`, `client.ts`, `apps/client/src/game/TownGame.ts`, `ui/common/lazy.tsx`, `packages/assets/src/runtime.ts`), with no errors in voice files.
- **Not run yet (browser lock deadlocked):** the voice e2e set (`v2-social`, `v2-phone`, `game-full`; `voice-live` skips
  without real LiveKit credentials) and an ad-hoc Enable-voice check (lazy chunk not requested before the click;
  offline `VoiceEngine-*.js` abort shows "Voice could not be loaded" and the button comes back; second click loads it;
  reload of a voice-enabled tab re-enables without a click). The sandbox `perf-wp5-iso` has the runner
  (`bash wp5-e2e.sh <specs>`, own server on 127.0.0.1:3374) and the spec `tests/e2e/zz-wp5-voice-enable.spec.ts`
  (sandbox only, not in the repo). I queued the run for about 40 min and then withdrew it.

## WP6 — HTTP caching + deploy safety (perf-wp6)

**Files:**
- `apps/server/src/app.ts`: static section only.
- `scripts/deploy-hshi-u1.sh`: additions only. The prod guard, users, permissions and install flow are unchanged.
- New `apps/server/test/static.cache.test.ts` (port 3376).
- `docs/deployment.md`: new section "HTTP caching and old chunks across deploys".

**Origin headers before → after.** Local server on 127.0.0.1:3376 with the real built dist, `curl -sI`. "Before" is HEAD's `app.ts` with the same dist.

| Request | Before | After |
|---|---|---|
| `/assets/TownGame-BCPoKhZI.js` | 200 `public, max-age=3600` | 200 `public, max-age=31536000, immutable` |
| `/landing/logo.webp` | 200 `public, max-age=3600` | 200 `public, max-age=86400, stale-while-revalidate=604800` |
| `/tutorial/manifest.json` | 200 `public, max-age=3600` | 200 `no-cache` |
| `/` and `/lobby/AbCd1234` (`Accept: text/html…`) | 200 html `no-cache` | 200 html `no-cache` (unchanged) |
| `/assets/TownGame-OldHash1.js` (missing) | **200 text/html** `no-cache` (SPA shell) | **404 text/plain `no-store`** |
| `/landing/nope.png` (missing, HTML Accept) | **200 text/html** | **404 text/plain `no-store`** |
| `/healthz` | no Cache-Control | no Cache-Control (unchanged) |
| `/api/me` | 401 `no-store` | 401 `no-store` (unchanged) |

- The CSP, nosniff and frame headers are byte-identical on every response.
- All 76 files in `dist/assets` have hashed names (0 unhashed).
- Expected effect on prod:
  - repeat visits no longer revalidate the entry JS/CSS, fonts and atlases every 4 h at the edge;
  - an old tab's chunk request after a deploy is served from the carried-over assets, or else gets a real, uncached 404 instead of a 4 h-cached HTML page.
- The prod `curl --resolve … cf-cache-status` check is for the lead after the deploy; the commands are in `docs/deployment.md`.
- A warm-cache browser run was not done. Inside one test window the old 1 h `max-age` also serves from cache, so the difference only shows after the TTL expires.

**Deploy carry-over:**
- `carry_assets snapshot` runs before the deploy, `merge` after a successful one, and `discard` after a failure.
- Only a release's own files (`dist/.own-assets`) are carried, so an old chunk lives exactly one release.
- It never overwrites a file and restores the read-only bit afterwards.

It was tested in isolation on hshi-u1 with temp dirs. The function text was generated by the Mac's bash 3.2 `declare -f`, exactly as the deploy sends it. 21/21 checks passed, covering:
- the first deploy without a manifest;
- idempotent re-runs and a same-sha redeploy;
- expiry after one release;
- a failed deploy (discard);
- the merge guard when the live tree is not the deployed sha (auto-rollback);
- a rollback deploy;
- the dev tree;
- the no-live-tree, no-staging and unknown-phase cases.

Known window: the merge runs after the restart and health check, so an old chunk can 404 (uncached) for a few seconds. A zero-window variant needs a pre-restart hook in lead-owned `deploy/bin/install-release.sh`.

**B: the `game.tick` spike** (`tests/perf/game-module-bench.ts --games 4 --players 15`):
- The bench now shows max 10.0 ms, avg 57 µs. The audit run showed 24 ms.
- The slow tick is deterministic: it is always tick 104 of each game, in the first bedtime, in every game and every order.
  - cold (first game): 9.5–9.8 ms;
  - warm: 4.3–5.7 ms.
- A CPU profile of exactly that tick (20 µs sampling) shows the cause: `game/index.ts syncWorld → world.escortStragglers → setEscort → startWalk → planLeg → findPath` (4.6 of 5.3 ms).
  - `world/path.ts segmentSafe` takes 3.5 ms. It does 4 `isBlockedPx` margin probes per pixel along each string-pulled segment.
  - The escort plans paths home for all 15 stragglers in the same tick.
- The cause is not in `apps/server/src/auto/**`, so there is no fix here. It happens once per bedtime and stays far below the 50 ms tick budget.
- Suggestions for world-art: plan at most 3–4 escorts per tick, or have `segmentSafe` step 2 px / test the blocked-tile bitmap per tile.
- The auto tests are green and unchanged.

**Commands (all on hshi-u1, CT_AGENT=perf-wp6):**
- `scripts/remote.sh pnpm vitest run apps/server/test/static.cache.test.ts` → 1st run 8/9 (the 304 check failed because undici adds `Cache-Control: no-cache` to conditional requests; fixed in the test), then **9/9 pass**.
- `scripts/remote.sh bash -c 'pnpm --filter @ct/server --filter @ct/client build'` → ok.
- curl header script against `node apps/server/dist/server.js` on 127.0.0.1:3376 for the new and the HEAD `app.ts` → the table above.
- `scripts/remote.sh bash /tmp/carry-test.sh /tmp/carry_assets.fn.sh` → 21 PASS / 0 FAIL (run twice).
- `scripts/remote.sh pnpm -r run typecheck` → exit 0.
- `scripts/remote.sh --no-sync pnpm vitest run apps/server/test` → 29/30 files pass and 282 tests pass. `auto.room.test.ts` failed with `EADDRINUSE 127.0.0.1:3314`: it shares port 3314 with `playtest.persistence.test.ts`, a pre-existing collision. It passes alone: `pnpm vitest run apps/server/test/auto.` → 4 files, 40/40.
- `scripts/remote.sh --no-sync pnpm vitest run tests/integration tests/security` → 17 files, 101/101.
- `scripts/remote.sh pnpm exec tsx tests/perf/game-module-bench.ts --games 4 --players 15` → game.tick avg 57 µs, max 10.03 ms.
- Scratch tick trace and profile (not committed; in the sandbox only) → the cause above.

## Lead verification of the combined tree (WP1–WP4 finished by the lead after the perf fleet hit its usage limit)

WP1, WP2 and WP3 agents stopped mid-measurement (usage limit) and WP4 stopped while its e2e run was
queued; their code was complete in the working tree. The lead verified the **combined** tree
(commit `d9fc59d`) in one sandbox (`CT_AGENT=lead`) on hshi-u1. "Before" values are the audit
baseline in docs/perf-plan-v2.2.md §1 (same scripts, same scenarios, same host).

| Metric | Before (v2.1 audit) | After (d9fc59d) | Target |
|---|---|---|---|
| Entry `index-*.js` (before sign-in) | 270 KiB br | **36.5 KiB br** | ≤ 110 |
| Entry CSS | 23 KiB br | 22.1 KiB br | ≤ 15 (missed: every sheet stays in the entry to keep cascade order) |
| LobbyRoute chunk (colyseus, HUD, voice panel, chat; prefetched on home) | in entry | 68.2 KiB br | — |
| Storyteller panel chunk | in entry | 22.0 KiB br (lazy) | lazy |
| VoiceEngine chunk (livekit) | in entry | 125.9 KiB br (on "Enable voice") | lazy |
| TownGame chunk (Phaser) | 282 KiB br | 284.5 KiB br | unchanged |
| Runtime town atlases | 5.4 MiB PNG | **0.77 MiB WebP lossless** (cast 378 K, terrain 307 K, objects 78 K, square-props 13 K, social 6.5 K, lights 5 K, decor 0.7 K) + re-optimised PNG fallbacks | ≈ 0.8 MiB |
| Character picker before sign-up | full 3.6 MB cast sheet | portrait strip 52 KB WebP | ≤ 30 KiB (close) |
| cast sheet | 1280×3520 (17.2 MiB GPU) | 1920×2240 (16.4 MiB GPU) | ≤ 8 MiB (**not met**: trim/split of NPC + ghost blocks left for later) |
| Auth screen, Slow-4G phone profile (local, uncompressed) | 7.2 s | **2.5 s** | — |
| Town fully loaded, same profile (local, uncompressed) | 46.3 s | **16.7 s** (canvas at 10.8 s) | ≤ 10 s est. prod with br |
| S2C per client, 16 clients day walk | 13 986 B/s (`world:snapshot` 12.2/s × 1144 B) | **1 487 B/s** (`world:snap2` 10.6/s × 134 B) — −89 % | ≤ 2 500 |
| Server CPU, same scenario | 5.0 % of a core | 4.9 % | — |
| Desktop walk (GPU) main thread / DOM mutations/s / style recalcs/s | 11 % / 39.8 / 37.5 | **7.5 % / 12.6 / 25.3** | ≤ 5 mutations/s (**not met**, see below) |
| Phone profile walk (4× CPU) main thread / DOM mutations/s | 32.8 % / 69.4 | **13.9 % / 18.4** | ≤ 15 % ✅ / ≤ 5 (not met) |
| Frames > 33 ms, phone walk | 2 (max 217 ms) | 0 (max 17 ms) | none > 50 ms ✅ |
| Night inside home main thread | 6.3 % | 3.5 % | — |
| No-GPU proxy (SwiftShader) desktop idle 1440×900 | 16.9 fps | **29.5 fps** (low tier: 30 fps cap, 0.75 render scale) | ≥ 30 ✅ (cap) |
| No-GPU proxy phone walk | 30 fps, p99 50 ms | 59.8 fps, p99 16.8 ms | ≥ 30 ✅ |
| JS heap, desktop walk 20 s | 20–26 MB | 22 MB (Δ −0.6) | — |

Remaining HUD churn while walking (12–18 DOM mutations/s) is no longer the compass/first-steps
(they use `useStoreSelector` now and `localPlayer` notifies ≤ 10 Hz); it is under investigation by
the v2.2 QoL work — the budget below allows ≤ 25/s so it cannot regress.

### WP1 — assets (world-art agent, verified by lead)
`packages/assets/scripts/lib/encode.ts` (sharp, lossless WebP + PNG zlib 9), `scripts/cast/portraits.ts`
(portrait strip), `scripts/cast/sheet.ts`, `src/runtime.ts` (`@ct/assets/runtime`: format-agnostic
URLs; WebP when the browser decodes it, else PNG), `test/atlas-encoding.test.ts` (decodes every WebP and
compares RGBA pixel-exact with the PNG). Consumers switched: `TownScene.ts`, `game/social/art.ts`,
`ui/common/castPortrait.ts`.

### WP2 — render loop + low tier (world-art agent, verified by lead)
`game/fx/tier.ts` (normal/low tier, frame cap 60/30, 0.75 render scale on low, auto-drop on 5 s of
p95 > 33 ms, Settings override `ct.fxQuality`), lighting re-stamped only on change with 12 Hz flicker,
`setDepth` only when y changes, static ground + flat decor baked into one RenderTexture (re-baked on
WebGL context restore), label text styles set only on change, `localPlayer` notifies subscribers
≤ 10 Hz (per-frame readers use `get()`), pooled chimney puffs. `apps/client/test/town.tier.test.ts`.
Screens were not pixel-diffed by the agent; the lead's e2e gate (`v2-look`, `v2-phone`, `v21-clock`)
covers the visuals.

### WP3 — entry split + HUD churn (lead-owned, agent work verified by lead)
`main.tsx` keeps only auth + home; `LobbyRoute`, `AdminScreen`, `StorytellerPanel`, IntroTour are
`lazyComponent` chunks (`ui/common/lazy.tsx`, retry on failure; LobbyRoute prefetched on idle from
home; TownGame + atlases prefetched in the waiting room). `@ct/protocol/client` (no zod) is what the
client imports (`packages/protocol/test/client-entry.test.ts` guards it). Fonts: latin subsets only
(`ui/common/fonts.css`) + preload of the two above-the-fold woff2. `useStoreSelector` / `shallowEqual`
in `net/store.ts`; ClockChip/StClock re-render only the ticking text.

### WP4 — compact snapshots (world-art + lead, verified by lead)
`packages/protocol/src/snapshotCodec.ts`: `world:snap2` (quantised tuples, per-viewer skip-unchanged,
1 s keyframes, 2 Hz keepalive when idle, steady 10–12 Hz). Opt-in via the join capability; old clients
keep `world:snapshot`. Per-viewer state lives on the seat and is reset on reconnect; the codec only
ever encodes the output of `snapshotFor(pid)`. Tests: `packages/protocol/test/snapshotCodec.test.ts`,
`apps/server/test/world.snap2.test.ts`, and `world.leaks.test.ts` / playtest secrecy scanner now decode
snap2 frames (TestClient joins with the capability by default).

## WP7 — perf budgets (lead)

`node scripts/perf/budgets.mjs --bundle … --server … --client … --load … --out tests/perf/results/<date>.json`
checks 13 budgets (v2.2 measured value + ≈ 20 % slack) and exits 1 when one is over. First run:
all ok — `tests/perf/results/2026-10-15-v2.2.json`. Release checklist (all on hshi-u1, one browser at a
time, hold `~/clocktower/browser.lock`):

```
pnpm -r --if-present run build
node scripts/perf/bundle-report.mjs --json /tmp/ct-bundle.json
pnpm exec tsx tests/perf/server-profile.ts --players 15 --walk 40 --vote 20 --snap2 yes --ports 3300-3304 --out /tmp/ct-srv
pnpm exec tsx tests/perf/client-perf.ts --dist apps/client/dist --gpu yes --win 20 --profile no --only desktop-idle,desktop-walk,mobile-walk,night-home --out /tmp/ct-client
pnpm exec tsx tests/perf/client-perf.ts --dist apps/client/dist --gpu yes --only load --out /tmp/ct-load
node scripts/perf/budgets.mjs --bundle /tmp/ct-bundle.json --server /tmp/ct-srv/server-profile.json --client /tmp/ct-client/client-perf.json --load /tmp/ct-load/client-perf.json --out tests/perf/results/$(date +%F).json
```

**Commands run by the lead (hshi-u1, `CT_AGENT=lead`, tree = d9fc59d):**
- `pnpm -r --no-bail run typecheck` → 7/7 Done.
- `pnpm test` → 75 files passed + 1 skipped; 793 tests passed, 3 skipped.
- `pnpm -r --if-present run build` → ok; `node scripts/perf/bundle-report.mjs --json /tmp/ct-v22-bundle.json` → table above.
- `tests/perf/server-profile.ts --players 15 --walk 40 --vote 20 --snap2 no|yes --ports 3300-3304` → 13 986 vs 1 487 B/s per client.
- `tests/perf/client-perf.ts` runtime (GPU), `--only load`, and `--gpu no` windows → table above (0 page errors).
- `node scripts/perf/budgets.mjs …` → 13/13 ok.

## v2.2 voice UI — big rooms (voice)

Talking indicator in town (`apps/client/src/game/fx/talking.ts`, 4 hook lines in TownScene) + crowd panel.
Perf-relevant points: the town layer costs one length check per frame while nobody talks. A speaking
character gets a pixel-exact 1-px outline: one pooled Image per talker (synced to frame / crop / alpha
each frame) from a 512x512 outline atlas built on demand (one 32x40 getImageData + one upload per new
cast frame, slots recycled when full); the name-label wave glyph (one Graphics) is redrawn only when a
stepped pulse phase (4 steps / 900 ms) or a rounded position changes, and never animates on the low tier.
Outline depth is a player setting (Settings → "Talking outlines", `ct.talkOutline`): default "behind
buildings" y-sorts the outline just under its avatar (occluded like the sprite, lit like it at night);
"always on top" draws it above lighting and buildings. Re-read ~1/s only while someone talks. Speaking state is debounced in the engine
(`SpeakingHold`, 300 ms hang) *before* the change-only participant patch, so LiveKit active-speaker
flicker no longer causes extra VoicePanel renders or `voicePresence` sets. The panel's ordering is a
`useMemo` on the participants array (recomputed only on a patch). No new dependency; `livekit-client`
stays out of the entry chunk (`speaking.ts` is pure; nothing new is imported by VoiceClient except it).
Not measured with a bundle report (adds ~3 KiB raw to the entry: speaking.ts + panel code).

## v2.4 — P3 server CPU (perf server)

**Question:** the v2.4 plan measured server CPU for 1 ST + 15 players walking at 7.7 % of a core on v2.3 vs
4.9 % on v2.2 (+57 %). **Answer: the +57 % is a measurement artifact, not v2.3 code.** v2.3's protections
(socket budget, violation score, settings registry, voice reconciler/caps, moderation, chat filter) cost
≈ 0.01–0.02 % of a core in this scenario. With the same measurement method v2.2 and v2.3 are equal.

All runs on hshi-u1 through `scripts/remote.sh` (capped slice), test server on 127.0.0.1:3305-3309, v2.2 =
`git archive 466ef66` in its own sandbox (`CT_AGENT=v24-server-v22`, same `server-profile.ts` copied in),
runs interleaved v2.3 / v2.2 to share host noise. Numbers = `A day-walk` % of one core (`/proc` utime+stime).
JSON: `tests/perf/results/2026-10-16-v2.4-p3-server.json`.

| Measurement (day walk, 16 clients) | v2.2 (466ef66) | v2.3 (28a9d6e) | v2.4 P3 |
|---|---|---|---|
| V8 profiler on (`--cpu-prof`, 500 µs; the budget's method), **cold** sandbox (1st run after install) | 8.2 | 8.2, 8.2 | — |
| V8 profiler on, warm sandbox | 5.1, 4.9 | 5.1, 5.2, 5.5 | 5.1, 5.2, 5.4 |
| **profiler off** (`--cpuprof no`), tsx source | 2.2, 2.1, 2.0 | 1.9, 2.1, 2.0 | 2.4, 2.4, 2.5 (busier window; v2.2 in that window: 2.4, 2.4) |
| profiler off, every member wants voice (`--voiceoptin yes`) | 2.4, 2.4 | — | 2.5, 2.5 |
| profiler off, **built bundle as prod runs it** (`--mode dist`) | 2.3, 2.3, 2.4 | — | 2.3, 2.5, 2.4 |
| RSS (dist) / anonymous RSS | 247 / 190 MB | — | 266 / 209 MB (+18 MB: more modules) |

**Attribution of the 7.7 % (per-thread CPU from `/proc/<pid>/task`, new in server-profile.ts):**

| Thread | cold run | warm run | profiler off |
|---|---|---|---|
| MainThread (JS + libuv + socket syscalls) | 2.9 | 2.9–3.1 | 1.4–1.9 |
| `v8:ProfEvntProc` (the CPU profiler's own thread) | **3.3** | 1.6–1.8 | — |
| `WorkerThread` (tsx loader thread; only alive when tsx's compile cache is cold) | **1.5** | — | — |
| V8Worker (GC / compiler helpers) | 0.5 | 0.5 | 0.4–0.6 |

- The CPU profiler itself costs ≈ 3 % of a core (its thread + sampling signals on the main thread): the
  "server CPU" budget value (`serverCpuPct16`, 4.9 %) is ≈ 60 % profiler overhead. The true cost of a
  16-client lobby is ≈ 2.0–2.5 % of a core, unchanged since v2.2.
- In a **fresh sandbox** (first run after `remote.sh` installs), tsx's compile cache is cold: its loader
  worker thread stays up and gets its own V8 profiler, adding ≈ +3.3 %. Reproduced: new sandbox
  `v24-server-cold` → 8.2 %, the next run in the same sandbox → 4.9 %. The v2.4 baseline (7.7 %) and my
  first run (8.2 %) were such first runs; v2.2's 4.9 % was a warm run. Production runs the built bundle
  (no tsx): see the dist row.
- Steady-state JS (V8 profile with the first 20 s skipped, `cpuprofile-summary.ts --skip 20000`, 43 s):
  v2.2 301 ms busy, v2.3 410 ms (≈ +0.25 % of a core), almost all in the snapshot fan-out
  (`sendSnapshots` 97 → 175 ms: ws `sendFrame`/`writev` and the snap2 encoder; same bytes/frames on the
  wire, same code since v2.2 — not visible in the profiler-off totals, so profiler/host noise). v2.3's
  additions in the same window: `socketBudget.take` 5 ms (0.01 %), violation score 0 (runs only on a
  violation), settings registry getters 0, voice coordinator tick 1 ms, reconciler (one timer per process,
  60 s) 0, moderation / chat filter 0, recorder 3 ms, logging 0.
- Micro-bench (`tests/perf/server-hotpath-bench.ts`, one variant per process): socket budget 35 ns per
  incoming frame (≈ 6 µs/s for 160 frames/s), violation score 90 ns per violation, `move` Zod parse 127 ns.

**Change (protections identical):** `apps/server/src/guard/socketBudget.ts` — `liveSocketBudget()` (called
for every incoming frame) returns a cached frozen spec rebuilt only when the host-limits snapshot object
changes (`setHostLimits`/`resetHostLimits` always install a new one), instead of allocating a spec per
frame. Effect within noise (V8 already scalar-replaced the allocation once optimised: 35 → 33 ns/frame),
but it is now allocation-free in every JIT tier and still live on the next frame (unit test). No other
hot spot worth touching was found; nothing was relaxed.

**Memory.** 5-minute walk, profiler off (`--walk 300 --cpuprof no`, RSS + anonymous RSS every 10 s): anon
RSS 214 → 217 MB, then a one-time release to 88 MB ≈ 2 min after start-up (reproduced in 2 runs), then flat
88–93 MB (±4 MB GC sawtooth) to the end — no growth. Lobby churn:
`apps/server/test/lifecycle.leaks.test.ts` opens 12 lobbies in 3 waves with the real modules and voice
configured (unreachable LiveKit), everyone leaves, lobbies are disposed: 0 live voice coordinators, 0
per-lobby moderation states, still exactly one usage reconciler, no remembered member IPs, ref'd timers
back to the baseline. (New read-only diagnostics: `voiceProcessStats()` in `voice/index.ts`,
`voiceMemberIpCount()` in `voice/ip.ts`, `moderation.lobbyCount()`.) Per-lobby voice state has no timers
of its own (the coordinator is ticked by the room); the 10 s IP clean-up after dispose is unref'd.

**Recommendation for the budget (P1 / lead, `scripts/perf/budgets.mjs`):** measure `serverCpuPct16` with
`--cpuprof no` (≈ 2.0–2.5 %; e.g. max 4 %) — or keep the profiler but always do one warm-up run in the
sandbox first — otherwise the budget mostly measures the profiler and flags cold sandboxes.

**New opt-in flags (defaults unchanged):** `server-profile.ts --cpuprof no`, `--voiceoptin yes`,
`--mode dist`; every phase now also records `serverCpuUserPct`, `serverCpuSysPct`, `serverCpuThreads`,
`rssSamplesMb`, `rssAnonSamplesMb`. `cpuprofile-summary.ts --skip <ms>`. New `tests/perf/server-hotpath-bench.ts`.

**Commands run (CT_AGENT=v24-server[-v22|-cold|-bench|-test], hshi-u1):**
- `pnpm exec tsx tests/perf/server-profile.ts --players 15 --walk 40 --vote 20 --snap2 yes --ports 3305-3309 [--cpuprof no] [--voiceoptin yes] [--mode dist] --out /tmp/ct-v24s-*` — 3 interleaved rounds each for profiler on / off / dist, 2 for voice opt-in, 2 cold-vs-warm; plus `--walk 300 --cpuprof no` twice (memory). All completed.
- `pnpm exec tsx tests/perf/cpuprofile-summary.ts <profile> --skip 20000 [--focus …]` on v2.2 / v2.3 / P3 profiles.
- `pnpm exec tsx tests/perf/server-hotpath-bench.ts [--only old|new]` (first run: shared process → misleading polymorphic numbers; then one variant per process).
- `pnpm --filter @ct/server build` (both trees) for `--mode dist`.
- `pnpm vitest run apps/server/test/lifecycle.leaks.test.ts` → 1/1 pass.
- `pnpm -r --no-bail run typecheck` → 7/7 Done; `tsc -p` over tests/perf/{server-profile,cpuprofile-summary,server-hotpath-bench}.ts + tests/support (temp tsconfig) → 0 errors (after typing `sleep` as `Promise<void>` in server-profile.ts, a pre-existing error).
- `pnpm vitest run apps/server tests/security tests/integration` → 65 files passed + 2 skipped; 603 tests passed, 7 skipped.
- `pnpm test` (full, tree incl. the other v2.4 packages' work in progress at 16:45) → 116 files passed + 3 skipped; 1257 tests passed, 10 skipped.

## v2.4 — P1 (measurement + town runtime)

**Walk finding.** The v2.3 walk windows were measuring an interior, not a walk. WASD worked: the
keyboard focus was on `body`, no modal was open, and the player moved. The square D→S→A→W loop starts
at the player's own door after "Leave", and since the walkable cottages (v2.2) it walks straight back
into a cottage. Re-running the v2.3 sequence with position tracking showed this. Before the walk the
player was outdoors at (632, 398). After the window they were in `bld:house-6`, and the next window
(mobile-walk) was spent entirely inside. Inside, the camera shows only the room, so the main thread
was low (4.2 / 6.7 %) and there was 0 HUD churn. This is a test problem, not a product bug.
Separately, WASD after chatting is not swallowed in a harmful way: the chat input keeps focus after
a send by design, and Escape or an empty Enter hands the keys back.

**Test fix (`tests/perf/client-perf.ts`).**
- Every walk window now starts on an open outdoor spot. `openWalkSpot()` uses the layout to find a
  spot whose whole 180×180 px loop box plus a margin is walkable, outdoors and away from doors; it is
  (272, 256) next to the square centre. The Storyteller bot teleports the browser player there.
- Each window samples `__ctCamera.me()` every 200 ms and **throws** if the path is < 100 px or the
  player left the outdoors (`moved` in the JSON).
- Every window also records `scene` (bots connected / outdoors, close codes, browser position) and
  `domMutationsTop` (which element churns).

**Hot spot found by the CPU profile (unminified build, GPU, perf-plan-v2.2 §5).** The cost was
Phaser `Graphics` paths that are re-tessellated **on every frame**. In Phaser 3.90 every `arc` is
100 points, so `fillRoundedRect` is about 400 points, and `fillPath` runs earcut each frame. The
15 house-name backdrops (`gameplay/houseNames.ts`, `fillRoundedRect`, added late in v2.2 after the
v2.2 measurement) and the door-tag fallback discs (`doorTags.ts`, `fillCircle`) never change, but they
paid for earcut on every frame:
- Desktop walk: `earcutLinked` + `isEarHashed` + `earcut` + `batchFillPath` + `GraphicsWebGLRenderer`
  = 1.71 s of 20.9 s (**8.2 % wall**).
- Phone profile (4× CPU): 6.0 s of 20.8 s (**29 %**).

The fix is the new `game/render/roundRect.ts`, which draws the same shape as non-overlapping
horizontal `fillRect` bands: one per device pixel at the corners, at most 12 per corner, and a
translucent fill still blends once. After the fix, earcut is gone from the profile and
`GraphicsWebGLRenderer` is 40 ms (desktop) / 91 ms (phone).

Other features at the same profile, after the fix, as phone-profile inclusive share of wall time:
- Phaser render: 8.6 %.
- `TownScene.update`: 4.1 %, which includes lighting 1.8 %, local step 0.8 %, ambience / NPCs 0.65 %
  and remote steps 0.34 %.
- Gameplay layer update (board tokens, seat markers): 0.2 %.
- Bubbles, talking outline, pie menu, interiors and NPC avoidance: each < 0.2 %, not separable from
  noise.
- HD avatars: no separate cost; the sprites batch like the others, and `batchSprite` is 2 %.

None of these needed a fix. The clock-dial wedge (`TownScene.drawTownClock`, `g.slice`) still does one
100-point earcut per frame while a stage timer runs. It is small and left as a follow-up because
TownScene is shared with P2.

**HUD churn.** All remaining walking churn was the home compass (`GameScreen.tsx` `HomeCompass`):
about 5.5 re-renders/s × 3 mutations (`aria-label`, text, arrow `style`). The fix is a new pure
`game/hudRate.ts` `TrailingGate`: the first change shows at once, then at most one change per 500 ms,
and the last value is always delivered. home / inside / outdoors changes skip the wait. The
`aria-label` is now stable (`Your home, <house>`); the steps stay in the visible text, so the live
region no longer re-announces its label 5×/s.

**Before → after.** Same source snapshot and host, one headless Chromium at a time. "Before" is the
same tree with only the three P1 product files reverted. Every walk window moved
2 964–2 978 px (GPU) / 2 280–2 315 px (SwiftShader) and stayed outdoors. JSON:
`tests/perf/results/2026-10-16-v2.4-P1-client.json`.

| Window (GPU, RTX 3060, 20 s) | main thread % | script % | DOM mutations/s | style recalcs/s | fps / p95 ms |
|---|---|---|---|---|---|
| desktop-idle | 14.1 → **5.4** | 12.9 → 4.4 | 0.2 → 0.1 | 0.2 → 0.1 | 60 / 16.7 both |
| desktop-walk | 15.0 → **6.0** | 13.0 → 4.6 | 16.2 → **3.6** | 34.8 → 15.8 | 60 / 16.8 → 16.7 |
| mobile-walk (390×844, 4× CPU) | 44.4 → **19.6**¹ | 38.8 → 14.7 | 16.4 → **3.3** | 35.0 → 14.4 | 60 / 16.7 both |
| night-home | 4.3 → 3.7 | 2.9 → 2.5 | 0.1 → 0.1 | 7.9 → 7.9 | 60 / 16.8 → 16.7 |
| *v2.3 lead run (invalid: inside a cottage)* | *desktop-walk 4.2, mobile-walk 6.7* | | *0.2 / 0* | | |
| *v2.2 (d9fc59d)* | *desktop-walk 7.5, mobile-walk 13.9* | | *12.6 / 18.4* | | |

¹ Phone walk after the fix is 14.5–24.3 % across three runs: 14.5 (`fix1`), 19.6 (this table), and
24.3 with the V8 profiler attached. The runs overlapped with other agents' e2e and builds on the host
(capped slice), so treat it as ≈ 15–20 %.

| Window (no-GPU proxy, SwiftShader, 15 s) | fps | main % | script % | DOM mutations/s |
|---|---|---|---|---|
| desktop-idle 1440×900 | 41.2 → 39.0 | 94.3 → 95.0 | 2.6 → 2.4 | 0.6 → 0.6 |
| desktop-walk | 49.0 → 43.9 | 91.7 → 94.1 | 2.3 → 2.4 | 15.6 → **3.4** |
| mobile-walk 390×844 4× CPU | 60 → 60 | 64.8 → 64.2 | 7.7 → 7.5 | 15.7 → **3.4** |

The no-GPU proxy is bound by software rasterisation (script is only 2–8 %), so the earcut fix does not
change it. `fps` counts the browser's rAF callbacks, not Phaser renders, so the low tier's 30 fps
render cap does not show in it. Making the probe count Phaser renders is listed as a follow-up.

**Voice in big rooms (design and pure policy only; not wired).** New `apps/client/src/voice/talkerCap.ts`
`capStep()` decides which participants to decode: at most N (default 6), with hysteresis.
- A slot holder keeps its slot while it talks, for `holdMs` 4 s after it last talked, and for
  `minOnMs` 3 s after it was subscribed.
- A newcomer who talks takes the slot of the holder that has been inactive the longest.
- Free slots are pre-filled with the most recent, then nearest, silent people, so ≤ N people never
  resubscribe.
- The Storyteller is pinned.

It is meant to run after the WP5 `cullStep` in `VoiceEngine.tickGains`, with the same rule: only
tracks this client dropped are ever resubscribed. The wiring is described in the file header for the
voice owner; VoiceEngine is unchanged.

**Needs a human test with real LiveKit:**
1. `isSpeaking` / `audioLevel` of an *unsubscribed* participant keep updating.
2. Resubscribe latency, i.e. how much of a newcomer's first syllable is lost.
3. Phone CPU and downlink with 10 simultaneous talkers, cap on vs off.

**Files.**
- `tests/perf/client-perf.ts`
- new `apps/client/src/game/render/roundRect.ts`
- `apps/client/src/game/gameplay/houseNames.ts`, `apps/client/src/game/gameplay/doorTags.ts` (one call each)
- new `apps/client/src/game/hudRate.ts`
- `apps/client/src/game/GameScreen.tsx` (`useCompassFix` + aria-label only)
- new `apps/client/src/voice/talkerCap.ts`
- tests: `apps/client/test/{render.roundRect,hud.rate,voice.talkerCap}.test.ts`

**Commands (on the build host via `scripts/remote.sh`, `CT_AGENT=v24-measure` / `v24-unit` / `v24-base`):**
- `pnpm --filter @ct/client build`; `vite build --minify false` → ok.
  - The `v24-base` sandbox failed to build on P2's in-progress assets, so before/after were built in
    one frozen sandbox by swapping the three files.
- `flock ~/clocktower/browser.lock pnpm exec tsx tests/perf/client-perf.ts --ports 3392-3394 --dist … --gpu yes|no --win 20|15 --profile no|yes --only …`
  → runs `probe1`, `full1` (showed the walk entering `house-6`), `full2`, `prof1` (before profile),
  `fix1`, `r-before-gpu`, `r-after-gpu`, `r-before-sw`, `r-after-sw`, `r-after-prof`: all exit 0.
  - The first `full2` attempt failed in the new placement check: the teleport lands up to 20 px from
    the requested point, so the tolerance was raised to 24 px.
- `pnpm exec tsx tests/perf/cpuprofile-summary.ts /tmp/ct-v24m/{prof1,r-after-prof}/client-{desktop,mobile}-walk.cpuprofile …` → the attribution above.
- `pnpm vitest run apps/client/test/{render.roundRect,hud.rate,voice.talkerCap}.test.ts` → 3 files, 16/16 pass.
- `pnpm vitest run apps/client/test` → 26 files, 326/326 pass.
- `pnpm -r --no-bail run typecheck` → 7/7 Done.
- `tsc -p` (temp config: `tests/perf/client-perf.ts` + `tests/support/**`) → 0 errors.
- Not run: e2e. The compass text is unchanged; `game-full` / `game-chaos` assert it, so they belong in
  the lead's gate.

## v2.4 — P2 load path (perf-load)

Sandbox `CT_AGENT=v24-load` on the build host. "Before" = v2.3 HEAD `28a9d6e`, measured in the same sandbox
before any change. "After" = the shared working tree, which also contains P1's in-progress client files.
Load timings use the Slow-4G phone profile, local and uncompressed (`client-perf.ts --gpu yes --only load`, same flags as WP7).
JSON files:
- `tests/perf/results/2026-10-16-v2.4-p2-load-{before,after}.json`
- `tests/perf/results/2026-10-16-v2.4-p2.json` (`budgets.mjs --bundle --load`)

| Metric | v2.3 before | v2.4 P2 after | Target |
|---|---|---|---|
| Town network-idle, Slow 4G | 21.5 s | **16.5 s** (canvas 11.6 s) | ≤ 17 s ✅ |
| Town download: XHR (atlases + map) / total | 1.80 MB / 3.97 MB | **0.77 MB** / 2.94 MB | — |
| Auth screen, Slow 4G | 2.58 s (load event 5.0 s) | **2.54 s** (load event 4.6 s) | ≤ 2.6 s ✅ |
| Auth-screen stylesheet bytes | 151.8 KB | **63.2 KB** | — |
| Entry CSS (`index-base-*.css` + `index-*.css`) | 24.9 KiB br | **11.4 KiB br** (8.9 + 2.5) | ≤ 15 ✅ |
| LobbyRoute chunk | 83.4 KiB br | **63.8 KiB br** | ≤ 70 ✅ |
| Entry JS | 42.7 KiB br | 43.2 KiB br | ≤ 45 |
| cast sheet GPU | 2400×1920 = 17.6 MiB | **1760×960 = 6.4 MiB** | ≤ 8 ✅ |
| Ghost atlas, loaded on the first death | (in the cast sheet) | 896×672 = 2.3 MiB, 174 KiB WebP | — |
| `cast-hd.webp` (740 KB) on town load | every client | only when a lobby member has an HD character | — |
| HD portraits (picker, waiting room) | the 740 KB sheet | the 'down' column, 92 KiB | — |
| Runtime town atlases (budgets `townAtlasKiB`) | 835 KiB | 578.5 KiB | — |

**budgets.mjs caveat:** `entryCssBrKiB` takes the *first* file matching `assets/index-*.css`. The
entry CSS is now two files (index-base + theme), so the script reports 8.9 KiB and not the real
11.4 KiB. Fix (P1 / lead): sum all `assets/index-[^/]+\.css` files.

### What changed
1. **HD cast on demand.** `TownScene` no longer preloads `cast-hd`. `wantCastHd()` loads it:
   - when a lobby member's preset is an HD character (on every `lobby:view`);
   - when an avatar with an HD key is drawn.

   Until it arrives the avatar uses the regular cast frames; `refreshCastArt()` then switches every avatar over.
   DOM portraits draw the low-res frame first, then the HD frame from `cast-hd-portraits.*`. That file is the
   sheet's 'down' column, the same rows (see `hdPortraitStrip`). Other directions still load the full sheet.
2. **Cast atlas split.** `cast.*` now holds only living sheets: 33 blocks, 11×3.
   - Ghost variants moved to `cast-ghosts.*`. A ghost frame is the idle frame floated up by 2/3/4 px, so the atlas stores one 32×42 cell per direction; frame f is the 32×40 window `rowOffset[f]` (0,1,2,1,0) rows down.
   - `test/castGhosts.test.ts` proves every one of the 2240 ghost frames is pixel-identical to the old `ghostOf` output.
   - The town loads the ghost atlas when any player is dead (`onGame`) or a ghost avatar is drawn. Until then a dead avatar shows its living idle frame.
   - Board tokens draw ghost busts from the ghost atlas; until it loads they use a `/ghost-pending` key, which is replaced on `refreshBoards()`.
   - `castPortrait` reads ghost frames other than the strip's from `cast-ghosts.*`.
   - `cast.json` gains `ghosts: { image, cellHeight, rowOffset, sheets }`. The portrait strip and social atlas are byte-identical.
3. **LobbyRoute split.** One lazy chunk `townParts` (`ui/common/townParts.ts` + `lazyTown.tsx`, 11.3 KiB br) holds the parts that render only once Phaser is up, or only in automatic lobbies:
   - Notebook
   - Story
   - SocialPalette + PieMenu
   - ClockChip
   - AutoStorylineSetting (+ dealLogic / storylines)

   `LobbyRoute` prefetches it on mount next to `TownGame`. The waiting room's first frame is unchanged. In automatic lobbies the storyline row appears when the chunk lands; it is fetched in parallel with the join.
4. **Entry CSS / cascade order.**
   - `main.tsx` imports only the landing / auth / home sheets (help, auth, landing, lobby, RoleIcon) and the theme. Every other sheet ships with the component's lazy chunk.
   - The base sheets form a pure-CSS manual chunk `index-base`. Its link is moved before the theme link in `index.html`, and the theme link is marked `data-ct-css="theme"`.
   - Vite's preload helper is patched (build only, exact-match or the build fails, like the msgpackr plugin) to hand chunk `<link>`s to `window.__ctPlaceCss` (`ui/common/cssOrder.ts`, imported first). Feature sheets go before the theme, so the theme still wins ties as in the single bundle. The late dialogs (SettingsDialog, IntroTour) go after it, where they always were.
   - Dev mode re-sorts Vite's `<style data-vite-dev-id>` elements by the same order.
   - `apps/client/build/cssOrder.ts` (`CSS_ORDER`) fails the build when a sheet lands outside the scheme: an unknown sheet, the theme in a lazy chunk, a feature sheet in the entry, or a late sheet mixed into a normal chunk.
   - A lazy chunk whose entry is `ui/storyteller/index.tsx` is now named `storyteller-*` and no longer `index-*`, so tooling does not count its CSS as entry CSS.
   - No eval and no inline script or style (CSP / Trusted Types unchanged). The msgpackr plugin stays.

### Verification
- In a real browser (ad-hoc spec), the `<link>` order is:
  - auth screen: `index-base, index(theme), IntroTour`;
  - town: `index-base, LobbyRoute, StoryParts, townParts, index(theme), SettingsDialog`;
  - every sheet is applied, and toolbar buttons keep the theme's framed-button art.
- Screenshot pixel diffs, v2.3 vs after, for v2-look (14 shots) and ux-walkthrough (≈60 shots):
  - auth, home, help, create, waiting room and error screens: 0–2 % (randomised names and characters only);
  - town shots: random cottages, positions and characters.
- **One real visual change: the in-game Settings dialog.**
  - In v2.3 it picked up `ui/admin/admin.css`'s **unscoped** `.ct-set { display: flex; gap: 12px }` and `.ct-set-row` / `.ct-set-ctl` / `.ct-set-head` rules, because admin.css sat in the entry bundle. That collision was a bug: the admin page's settings tab uses the same class names.
  - Admin CSS now loads only with /admin, so the dialog renders as Settings.css specifies, about 12 px tighter.
  - Suggested follow-ups (lobby-auth): scope admin.css's `.ct-set*` rules under `.ct-admin`. If the v2.3 spacing is preferred, add `gap: 12px` to Settings.css `.ct-set`.

### Commands (build host, `CT_AGENT=v24-load`; baseline sandbox `v24-load-base` = `git archive HEAD`)
- `node scripts/perf/bundle-report.mjs --json …` before and after → the table.
- `pnpm --filter @ct/client build` + `flock ~/clocktower/browser.lock pnpm exec tsx tests/perf/client-perf.ts --dist apps/client/dist --gpu yes --only load --out …`, before and after → the table.
- `node scripts/perf/budgets.mjs --bundle … --load … --out tests/perf/results/2026-10-16-v2.4-p2.json` → all measured budgets ok.
- `pnpm assets:generate` → new `cast`, `cast-ghosts`, `cast-hd-portraits`. All other atlases are byte-identical. Pulled with `scripts/pull.sh`.
- `pnpm -r --no-bail run typecheck` → 7/7 Done.
- `pnpm vitest run apps/client packages/assets` → 32 files, 389 passed / 3 skipped. This includes the new `apps/client/test/css.order.test.ts` (11 tests) and `packages/assets/test/castGhosts.test.ts` (2 tests).
- e2e (under the lock) `hd-cast v2-look lobby v2-phone chat-bubbles ux-walkthrough` → 10 passed, 1 failed: hd-cast.
  - The cause: a bot was randomly given brianbi, so the picker tile was "taken by HD 4". New accounts get a random preset (`randomPlayable`), so this is a pre-existing flake of about 4/28.
  - Rerun of `hd-cast` → passed. The town avatar uses the `cast-hd` texture; the HD sheet and strip were requested on demand.
- Baseline sandbox: `v2-look ux-walkthrough hd-cast` → 3 passed. Its screenshots were used for the diffs.
