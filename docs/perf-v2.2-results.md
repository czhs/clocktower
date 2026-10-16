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
