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
