# Test results (executed commands only)

All commands run on **the host** via `scripts/remote.sh` unless stated otherwise.

## 2026-10-18 — v3.1 release gate (`v31-release`, branch `v3-game`, the host, sandbox `v31-release`)

Tree = v3.0 + `78caa62` (cherry-picked `docs/perf-v3/client.md`) + merges of `v31-fixes` (`8b7e642`), `v31-stage`
(`f90a701`) and `v31-cpu` (`3cd20d5`, both commits) + "v3.1: QA fixes" (vote frame vs the real HUD, house names hidden
in the vote view, softer talking rim). Merge conflicts: `docs/v3/INTEGRATION.md` §9.2 only (both sides kept).

| Command (`CT_AGENT=v31-release scripts/remote.sh …`, builds / tests under `flock -s ~/clocktower/v3-heavy.lock`) | Result |
|---|---|
| `pnpm -r run typecheck`; `pnpm exec tsc -p tests/tsconfig.json --noEmit` (right after the merges) | exit 0 (7/7), exit 0 |
| `pnpm build` + `bundle-report.mjs` + `budgets.mjs --bundle` (right after the merges) | exit 0; all measured ok; `town3d` 281.8 KiB br |
| QA-fix iteration: `pnpm --filter @ct/client run typecheck` + `pnpm vitest run …voteCam …world.hudKeep …avatars.parts …overlay` | exit 0; 8 files / 93 tests, then voteCam + hudKeep + world.stage 3 files / 27 tests |
| vote-frame probe: a scratch copy of `v3-vote.spec.ts` (host sandbox only, not in git) at 1920×1080 / 1280×800 / 1440×900, `CT_GL=gpu`, port 3450, both locks, 4 iterations | reproduced the QA finding (frame fit only fixed corner sizes); first hudKeep version pushed the circle off the left edge (toast class names missed, hint pill counted) → toasts ignored (`cth-toast*`), hint pill dropped, ring edge kept in frame; final stills: every seat clear of the HUD at all three sizes |
| **gate** `pnpm -r run typecheck` | exit 0 (7/7) |
| **gate** `pnpm exec tsc -p tests/tsconfig.json --noEmit` | exit 0 |
| **gate** `pnpm build` | exit 0 |
| **gate** `node scripts/perf/bundle-report.mjs --json /tmp/v31-bundle.json` + `node scripts/perf/budgets.mjs --bundle /tmp/v31-bundle.json --out tests/perf/results/2026-10-18-v3.1.json` | **all measured ok**: entry JS 44.1/45, entry CSS 12.3/15, LobbyRoute 68.5/72, TownGame 281.4/300, **town3d 282.7/300 (new key)**, atlases 578.5/700 KiB |
| **gate** `pnpm test` (full, after the build) | **exit 0: 175 files pass, 1 skipped; 2016 tests pass, 5 skipped** (133.1 s) |
| **gate** v3 e2e, one spec at a time: `E2E_V3=1 E2E_PORT=3450 CT_GL=gpu CT_E2E_NO_BUILD=1 flock -s v3-heavy.lock flock browser.lock nice -n 19 timeout 1500 pnpm test:e2e --project=v3 <spec>` (host GPU) | **all pass on the first run**: `v3-paths` 4/4 (29.5 s), `v3-boot` 1/1 (12.3 s), `v3-vote` 1/1 (28.3 s), `v3-doors` 1/1 (22.2 s), `v3-social` 1/1 (10.2 s), `v3-mixed` 1/1 (13.1 s), `v3-life` 1/1 (1.1 m), `v3-fallback` 4/4 (35.7 s), `v3-pageerrors` 1/1 (2.0 m; KHR_parallel_shader_compile false → "no compile window seen"; pre-warm 39 builds / 39 compiled / 0 timed out). **Page errors: none** in any run (no `pageerror` line, no `isReady`) |
| **gate** Classic: `E2E_PORT=3450 CT_E2E_NO_BUILD=1 … pnpm test:e2e --project=chromium doors.spec chat-bubbles.spec` | **2/2 pass** (53.5 s) |
| extra: `CT_GL=swiftshader … --project=v3 v3-boot` | 1/1 pass (1.0 m) |

Front branches' own runs (from their reports, not re-run here except through the gate above): `v31-fixes` —
`v3-pageerrors` failed on d9cc841 with 2× the `isReady` TypeError and passed 3× with the fix; harness `?mode=cycles`
(`render-check.sh`, SwiftShader) FAIL heapGrowthUnder10MB 15.37 → 97.08 MB before, PASS 15.36 → 20.34 MB after;
`tests/perf/v3-cycles-heap.sh --gl gpu` growth 95 → 6.55 MB, 0 engines retained; `tests/perf/v3-ui.ts` walk non-transform
writes 11.7 → 2.4 /s, bedtime UI writes 25.9 → 9.1 /s; client unit tests 69 files / 897. `v31-stage` — world.merge 12/12,
game3d 428/428, e2e `v3-doors` / `v3-life` / `v3-vote` 3/3 twice (port 3466); harness A/B and `v3-frame` numbers in
docs/perf-v3/stage.md §6. `v31-cpu` — 433 game3d tests, typecheck; SwiftShader cpu-tier runs in docs/perf-v3/cpu.md §7
(goal not reached: ~190 ms synced, 7.6-7.8 fps). C2 QA (read-only, on d9cc841): harness stills 6/6, a 10-bot playtest
18/18 steps with 0 page / console errors.

## 2026-10-18 — v3.0 release gate (`v3-release`, branch `v3-game`, the host, sandbox `v3-release`)

Tree = `116024f`: WP8 (`d66c622`) + the lead's merges of `v3-perf-stage`, `v3-perf-ui`, `v3-perf-learn`, `v3-perf-server`,
`v3-perf-cpu` (hand-resolved conflicts in `world/stage.ts`, `voice/reconciler.ts`, `vendor/engineHost.ts`) + the
cherry-picked `v3-perf-client` `68f9ef4`. First test of these merges together. No fixes were needed.

| Command (`CT_AGENT=v3-release scripts/remote.sh …`, under `flock -s ~/clocktower/v3-heavy.lock`) | Result |
|---|---|
| `pnpm -r run typecheck && pnpm exec tsc -p tests/tsconfig.json --noEmit` | exit 0: 7/7 projects clean, tests tsconfig clean |
| `pnpm build` | exit 0 (8.5 s client). `town3d` 1066.5 kB / 336.2 kB gzip (WP8: 1177.8 / 381.0), entry `index` 143.3 / 51.8 kB gzip, `TownGame` 1283.2 / 359.4 kB gzip |
| `node scripts/perf/bundle-report.mjs --json /tmp/v3rel-bundle.json` + `node scripts/perf/budgets.mjs --bundle /tmp/v3rel-bundle.json` | **all measured budgets ok**: entry JS 43.9/45, entry CSS 12.3/15, LobbyRoute 68.3/72, TownGame 281.1/300 KiB br, town atlases 578.5/700 KiB (runtime keys SKIP: no perf inputs) |
| `pnpm test` (full, after the build) | **exit 0: 172 files pass, 1 skipped; 1978 tests pass, 5 skipped** (133.1 s). Includes the merge-sensitive files `apps/server/test/voice.reconciler.test.ts` 2/2, `lifecycle.leaks.test.ts`, `apps/client/test/game3d/frameGate.test.ts` 7/7, `cpuTier.test.ts` 7/7, `bootPerf.test.ts` 17/17, `town.tier.test.ts` 15/15, `perf.hotpath.test.ts` 2/2 |
| v3 e2e, one spec at a time: `E2E_V3=1 E2E_PORT=3450 CT_GL=gpu CT_E2E_NO_BUILD=1 flock -s v3-heavy.lock flock browser.lock nice -n 19 pnpm test:e2e --project=v3 <spec>` (host RTX 3060) | **all pass on the first run**: `v3-paths` 4/4 (29.4 s), `v3-boot` 1/1 (12.2 s), `v3-vote` 1/1 (28.2 s), `v3-doors` 1/1 (23.3 s; no flake this time), `v3-social` 1/1 (10.1 s), `v3-mixed` 1/1 (13.0 s), `v3-life` 1/1 (1.1 min), `v3-fallback` 4/4 (38.2 s) |
| Classic regression: `E2E_PORT=3450 CT_E2E_NO_BUILD=1 … pnpm test:e2e --project=chromium doors.spec chat-bubbles.spec` (bot lobbies = v2) | **2/2 pass** (53.3 s) |

Engine merge check (by reading, `vendor/engineHost.ts`): `fpsLimit: tierFpsLimit(tier, ct.debug.fps)` (cpu tier → 30,
`ct.debug.fps > 0` wins) and `maxFps: V3_MAX_FPS` (0 when `ct.debug.fps < 0`); `runFrameLoop` gates on `fpsLimit` when > 0,
else `maxFps`, so the cpu cap and the 60 fps cap both hold. The dev deploy of the tagged `v3.0` commit and its browser smoke are recorded in the follow-up commit ("v3.0 dev deploy" below).

### v3.0 dev deploy (same day, after the push; the tagged commit `v3.0` = `4be9bb4`)

| Command (from the orchestrator checkout unless noted) | Result |
|---|---|
| `scripts/secret-scan.sh`; `git push origin v3-game`; `git tag -a v3.0 4be9bb4`; `git push origin v3.0` | scan clean (388716 lines); pre-push scan clean (23 unpublished commits); `d66c622..4be9bb4`; new tag `v3.0` |
| `scripts/deploy-hshi-u1.sh dev 4be9bb4` | **exit 0 in 14 s**: sandboxed build, `clocktower-dev` restarted (only that unit), `healthy: {"ok":true,"env":"development","version":"4be9bb4c2420689667d775adca53803c71efa6e3"}`; carry-assets kept 20 files of the previous dev release |
| on the host: `systemctl status clocktower-dev`; `curl 127.0.0.1:3001/healthz` and `/internal/version`; `GET / /v2/ /lobby/x /v2/lobby/x /v3-art-demo/`; `journalctl -u clocktower-dev -n 50` | active (running); `{"ok":true}` / version `4be9bb4…`; every path 200 `text/html` (the SPA shell); journal: shutdown, database ready, listening on 127.0.0.1:3001 with the new version, no errors. `/v3-art-demo/` on dev is the SPA shell, as before the deploy: `dev.env` has no `DEMOS_DIR` (prod has it; prod untouched, still `4ca13aa`, its `/v3-art-demo/` still serves the Hollowmere demo) |
| browser smoke on the host GPU against 127.0.0.1:3001 (scratch Playwright spec in the sandbox `.smoke/`, not in git; `flock browser.lock`; 1 page + 6 protocol bots, `ct.fxQuality=auto`, 1920×1080) | **1/1 pass (18.2 s)**: the v3 loading scene, the 3D town ready at tier `high` on the RTX 3060 (296 calls, 850k tris at ready; frame p50 1.6 ms), a game started, everyone teleported to the circle, a nomination → the vote framing (472 calls, 1.47M tris, p50 16.7 ms = the 60 fps cap), `/v2/` lobby finder. **2 page errors**: `TypeError: Cannot read properties of undefined (reading 'isReady')` = three.js `compileAsync`'s poll timer (`currentProgram.isReady()`) after an avatar body's material lost its program (avatars `prewarm`); the entry shows after `PREWARM_MAX_MS` anyway; not seen in the e2e (low tier); v3.1 item |

Stills (this machine, gitignored): `tests/v3/shots/v3.0/dev/{loading,town-square-players,voting-circle,v2-lobby-list}.png`.

## 2026-10-18 — v3 WP8 gate (`v3-wp8`, branch `v3-game`, the host, sandbox `v3-wp8`, capped remote.sh)

Tree = "v3 C1" (`0cfd0b8`) + WP8: URL paths finished (`LobbyRoute` path move), the v3 loading scene wired into
`GameScreen`, the voting-circle candle stakes removed (`vendor/town.ts removeDaisCandles`), the laptop-first phone
note, `v3-lobby-choice.spec.ts` + `createLobbyViaUI` deleted, `.claude/worktrees/` added to `scripts/rsync-excludes.txt`.

| Command (`CT_AGENT=v3-wp8 scripts/remote.sh …`, builds / tests under `flock -s ~/clocktower/v3-heavy.lock`) | Result |
|---|---|
| `pnpm -r run typecheck` + `pnpm vitest run apps/client/test/game3d/world.stage.test.ts apps/client/test/ui.v3loading.test.ts apps/client/test/game3d/world.dais.test.ts` (first pass; one TS2532 in `removeDaisCandles` fixed first) | typecheck 7/7 clean; 3 files / 30 tests pass |
| `pnpm -r run typecheck` (gate) | exit 0 (7/7) |
| `pnpm build` | exit 0 (`town3d` 1177.8 kB / 381.0 kB gzip; entry `index` 143.3 kB / 51.8 kB gzip) |
| `pnpm test` (full, after the build) | 166 files pass, **1 file / 2 tests fail = `tests/security/repo-hygiene.test.ts` REPO-03** (CGNAT + home-path scans) — environmental: the orchestrator checkout's `.claude/worktrees/` (perf agents' worktrees, gitignored) had been rsynced into the sandbox; 1946 tests pass, 5 skipped (168 files, 136 s) |
| `rm -rf ~/clocktower/work/v3-wp8/.claude/worktrees` (sandbox only; `.claude/worktrees/` now in `scripts/rsync-excludes.txt`), then `pnpm vitest run tests/security/repo-hygiene.test.ts tests/security/web-client.test.ts` | 2 files / 48 tests pass |
| `node scripts/perf/bundle-report.mjs --json /tmp/wp8-bundle.json` + `node scripts/perf/budgets.mjs --bundle /tmp/wp8-bundle.json` | all measured budgets ok: entry JS 44.0/45, entry CSS 12.3/15, LobbyRoute 68.3/72, TownGame 281.3/300 KiB br, town atlases 578.5/700 KiB (runtime keys SKIP) |
| e2e `E2E_V3=1 E2E_PORT=3451 CT_GL=gpu CT_E2E_NO_BUILD=1 flock -s v3-heavy.lock flock browser.lock nice -n 19 pnpm test:e2e --project=v3 v3-paths` (host GPU) | **4/4 pass** (53.8 s): `/` vs `/v2/` lobbies + lists, share-link moves without reload, the v3 loading scene incl. the GameScreen town build, the no-WebGL scene |
| same, `v3-vote` (1920×1080; asserts `stage().candlesRemoved` > 0 for all three dais meshes) | **1/1 pass** twice (31.3 s before the teleport/still change, 34.4 s after) |
| same, `v3-boot` | 1/1 pass (19.2 s) |
| same, `v3-social` | 1/1 pass (16.3 s) |
| same, `v3-doors` | **1/1 FAIL** (5.6 min): the keyboard walker stuck at (548.5, 267.9) px on the way to house-5 (client prediction stopped advancing; no server rejection, no teleport) |
| rerun (after `v3-lobby-choice` / `createLobbyViaUI` deletion; same dist): `v3-doors` | **1/1 pass** (33.1 s): the first failure did not reproduce = flaky walker (not a WP8 change: WP8 touches no movement / collision code) |
| rerun: `v3-paths` | **4/4 pass** (45.8 s) |
| `pnpm exec tsc -p tests/tsconfig.json` | exit 0 |
| `E2E_PORT=3451 CT_E2E_NO_BUILD=1 … pnpm test:e2e --project=chromium doors.spec chat-bubbles.spec` (Classic regression; bot lobbies are v2 and move to `/v2/lobby/x`) | **2/2 pass** (1.6 min) |

Release stills (this machine, gitignored): `tests/v3/shots/v3.0/vote-circle-no-candles.png`,
`vote-circle-seals.png` (1920×1080, host GPU, from `v3-vote`), `tests/v3/shots/v3.0/loading-join.png`,
`loading-town-build.png` (1280×800, from `v3-paths`). Not run: `v3-life`, `v3-mixed`, `v3-fallback`, the rest of the
Classic suite (C2).

## 2026-10-18 — v3 checkpoint C1a gate (`v3-gate`, branch `v3-game`, the host, sandbox `v3-gate`, capped remote.sh)

Tree = "v3 C1 WIP" (`4998ca5`) + the finished phase-1 packages (WP1-WP6, reviewed and fixed; WP1 / WP2 / WP4 not
wired into `TownGame3d.ts` yet), lead decisions D1-D4, WP7a harness + v3 e2e specs, perf recon tooling. Contract and
per-package detail: `docs/v3/INTEGRATION.md` §8 Status.

| Command (gate, one run under `flock ~/clocktower/v3-heavy.lock`) | Result |
|---|---|
| `pnpm -r run typecheck` | ✅ |
| `pnpm build` | ✅ |
| `pnpm test` (after the build, so `tests/security/web-client.test.ts` reads the production `dist`) | ✅ 159 files passed, 1 skipped; 1870 tests passed, 3 skipped (132 s) |
| `pnpm vitest run tests/security/repo-hygiene.test.ts` after the doc edits (no lock) | ✅ 17/17 |
| `bash scripts/secret-scan.sh --staged` (editing machine, before the commit) | ✅ clean (144 files) |

Package agents' runs that this checkpoint relies on (all via `CT_AGENT=v3-<name> scripts/remote.sh`, SwiftShader /
CPU only, heavy + browser locks for browsers):

| Package / agent | Command | Result |
|---|---|---|
| WP2 fix (`v3-avatars`) | client `tsc --noEmit`; `vitest run test/game3d` | ✅; 27 files / 370 tests |
| WP2 fix | DEV smoke `avatars/dev/avatarSmoke.mjs` (`SMOKE_PORT=3462`) | run A ❌ (rim probe moved the camera: one extra program; brianbi rim hidden by a roof) → probe fixed; runs B and C ✅ 47/47 (low: programs 63 constant, build of 38 bodies ≈ 319 s; high: programs 42 constant, late joiners pre-warmed) |
| WP3 fix (`v3-stage`) | `vitest run apps/client/test/game3d/world packages/assets/test/hollowmere.test.ts`; `vitest run packages/assets apps/client/test` | ✅ 9 files / 104; ✅ 70 files / 967 (3 skipped) |
| WP3 fix | `scripts/v3/stage-smoke.mjs` (port 3465, low tier, canopy on) | ✅ 27/27 (programs 41 constant; prefetched interior switch 1 ms; cold ST teleport 144 ms) |
| WP4 D2 + fix (`v3-overlay`) | `vitest run apps/client/test/game3d/overlay`; `vitest run apps/client/test/game3d`; client tsc | ✅ 5 files / 53; ✅ 25 files / 335; ✅ |
| WP5b verify (`v3-world`) | e2e `--project=chromium classic-in-v3 doors.spec` (`E2E_PORT=3475`) | ✅ 4/4 (2.2 min; all 15 cottages through their v3 doors, v2 → v3 in one page, Q7 phone shots) |
| WP5b fix | `classicV3.test.ts`; `pnpm -r run typecheck`; `tsc -p tests/tsconfig.json` | ✅ 18/18; first run ❌ (duplicate `npcs` key in a TownScene debug hook, fixed) then ✅; ✅ |
| WP6 fix (`v3-ui`) | WP6 unit set + `lobby.world.test.ts` | ✅ 10 files / 139 |
| WP6 fix | e2e `v23-settings` + `lobby` (`E2E_PORT=3480`) | first run ❌ 1/8 (second create dialog not closed by an Escape sent right after the radio check: post-paint key-listener race; test now uses Cancel) → ✅ 8/8 |
| WP6 fix | `pnpm build`; `tests/security/web-client.test.ts`; `budgets.mjs` | ✅; ✅ 31/31 (❌ 2 when run against the dist the e2e webServer builds under `NODE_ENV=test`); ✅ entry JS 42.7/45, entry CSS 11.5/15, LobbyRoute 67/72, TownGame 295.9/300 KiB br |
| WP7a (`v3-qa`) | `harness.scenario.test.ts`; tsc over client, `tests/`, `tests/v3/` | ✅ 11/11; ✅ |
| WP7a | harness `projection`, `cycles` (port 3460) | ✅ (15 samples at scales 2/3/4); ✅ 5 mounts + 2 tier rebuilds + 1 crash (heap figures bucketed: re-run with `--enable-precise-memory-info` pending) |
| WP7a | `E2E_V3=1 … --project=v3 v3-boot v3-fallback v3-lobby-choice` (`E2E_PORT=3485`) | ✅ `v3-boot`, `v3-lobby-choice` "town choice from the UI" + "each lobby renders the right town", `v3-fallback` "leftover boot mark"; ❌ `v3-fallback` "chunk fails" (real bug: the one retry never re-requests the chunk, INTEGRATION.md §9.3); ❌ pending C1: context-loss rebuild, perf sampler fallback, join preview |
| WP7a | `--project=chromium doors.spec chat-bubbles door-boards` (`E2E_PORT=3486`) | ✅ 3/3 |
| D3 (`v3-radial`) | `social.radial` + `social.controller` + `social.logic` unit | ✅ 3 files / 83 (`social.radial` 45); mutation check: 17/45 fail with the gate disabled, as intended |
| D3 | `pnpm -r build` then `v2-social.spec.ts` ×3 (`E2E_PORT=3456`) | first version ❌ (slide-to-pin committed Point; discarded); final ✅ 2/2 three times |
| perf recon (`v3-perf-*`) | measurement tooling only (`docs/perf-v3/recon-*.md` list each run) | frame / load / classic / net recon ran; the `chars` and `server` runs were cut off by the usage limit (tools committed, results partial) |

## 2026-10-16 — v2.4 release gate (lead, hshi-u1, sandbox `lead`, capped remote.sh)

Tree = v2.3 (`28a9d6e`) + v2.4 P1 (client runtime), P2 (load path), P3 (server CPU) + lead fixes
(admin.css `.ct-set*` scoped under `.ct-admin`; budgets.mjs sums entry CSS; perf results no longer
record host paths).

| Command | Result |
|---|---|
| `pnpm -r --no-bail run typecheck` | 7/7 Done |
| `pnpm -r --if-present run build` | ✅ |
| `pnpm test` (first run) | 1263 passed, ❌ 1: `repo-hygiene` REPO-03 — two P2 perf JSONs recorded a host home path (redacted; `client-perf.ts` now writes `dist` repo-relative) |
| `pnpm test` (final tree) | 118 files passed, 1 skipped; 1264 passed, 3 skipped |
| e2e (`~/clocktower/work/lead-e2e24.sh`, serialized under the browser lock): `v21-clock v2-social v2-phone v2-look v2-st-ui ux-ready chat-bubbles door-boards door-reconnect doors hd-cast v23-chat v23-settings ops-moderation ops-admin-settings game-chaos ux-walkthrough` | all ✅ |
| e2e `lobby` | ❌ 1/6 in the gate (`v2 roster…` — "You are … now." not shown within 10 s); ✅ 6/6 on two re-runs → flake |
| e2e `game-full` | ❌ in the gate (step 3b' test helper: `no path from 1548,97` for a bot's walk home); ✅ on re-run (7.7 m) → flake |
| `node scripts/perf/budgets.mjs` (bundle-report, `server-profile.ts --snap2 yes --cpuprof no` after one warm-up run, `client-perf.ts --gpu yes` windows + load) | **13/13 ok** → `tests/perf/results/2026-10-16-v2.4.json`. First attempt forgot `--gpu yes` (SwiftShader numbers, 3 over); the header now spells out the flags |

Key numbers: entry CSS 11.4 KiB br (v2.3 24.9), LobbyRoute 63.8 (83.4), town atlases on entry 578 KiB
(835), server CPU 2.2 % core profiler-off, phone walk main 12.1 %, HUD churn 3.6/s (v2.3 real walk
≈ 16), Slow-4G town network-idle 16.4 s (21.5).

## 2026-10-16 — v2.2.1 merge of Isaac's GitHub `main` into v2.2 (integration teammate, the host, sandbox `merge-isaac`, capped remote.sh)

All commands via `CT_AGENT=merge-isaac scripts/remote.sh …`; browsers under `flock ~/clocktower/browser.lock`, `CT_E2E_NO_BUILD=1`, `-c tests/e2e/playwright.config.ts`.

| Executed command | Result |
|---|---|
| `pnpm assets:generate` (+ `scripts/pull.sh packages/assets/generated`) | All atlases regenerated (cast/cast-portraits/social/cast-hd changed; terrain/decor/objects/lights/square-props byte-identical). |
| `pnpm -r run typecheck` | Passed (twice: mid-merge and final tree). |
| `pnpm test` (first) | 1037 passed; failed: `nicksong.test.ts` roster count 27 → 28 (updated) and git-excluded local `tests/security/host-safety.test.ts` (no free port). |
| `pnpm exec vitest run packages/assets packages/protocol/test/snapshotCodec.test.ts apps/client/test/castPicker.test.ts apps/client/test/npcRoaming.test.ts` | 82 passed, 3 skipped (atlas-encoding incl. cast-hd WebP == PNG, hdCast, nicksong, new ackSeq codec test, castPicker, npcRoaming). |
| `pnpm test` (final tree) | 101 files passed, 1 skipped; 2 failed = the git-excluded local v2.3 files `tests/security/host-safety.test.ts` and `tests/security/web-render.test.ts` (expected). |
| `pnpm -r --if-present run build` | Passed (client rebuilt 3× after TownScene fixes). |
| `playwright test hd-cast doors door-reconnect door-boards chat-bubbles` (first) | 3 passed; chat-bubbles failed (voice panel covers Leave at a 390 px desktop window → spec resizes back first); doors failed at −10 px approach (trigger) → fixed. |
| `playwright test doors.spec chat-bubbles` | chat-bubbles passed; doors failed on the tap-during-cooldown check → route now waits out the cooldown. |
| `playwright test doors.spec` | 1 passed. |
| `playwright test hd-cast doors.spec door-reconnect door-boards chat-bubbles lobby.spec v2-social v2-phone` | **14 passed (7.9m).** |
| `GAME_RUN=merge1 playwright test game-full` | Failed step 5 (leaveByKey: ArrowDown did not walk out of house-3); not reproduced in later runs. |
| `GAME_RUN=merge2 playwright test game-chaos` | **1 passed (4.6m).** |
| `GAME_RUN=merge3 playwright test game-full` | Step 5 passed; failed 8a (ST "↶ Undo" covered by the toolbar ⚙ button; not reproduced later). |
| `GAME_RUN=merge4 playwright test game-full` | Failed 3b': the keyboard walker entered a neighbour's cottage passing its door diagonally (20 px door trigger) → wide trigger now only for straight pushes. |
| `playwright test doors.spec door-reconnect` (final build) | **2 passed.** |
| `GAME_RUN=merge5 playwright test game-full` (final build) | **1 passed (7.4m).** |
| `GAME_RUN=merge6 playwright test game-chaos` (final build) | **1 passed (4.7m).** |
| `playwright test hd-cast door-boards chat-bubbles lobby.spec v2-phone v2-social` (final build) | 11 passed; v2-social desktop+phone failed once (pie "Point" gone before the tap). |
| `playwright test v2-social` (rerun) | **2 passed.** |
| `bash scripts/secret-scan.sh` (Mac) | Removed a home path from Isaac's test-results row; 5 remaining findings all pre-exist on HEAD (bootstrap.sh / progress.md tailnet name, test-results CGNAT IP + home path, cloudflared example home path). |

## 2026-10-16 — playable Brianbi and bounded NPC avoidance

Run on the editing Mac for the requested local preview, using Node 24.22.0 / pnpm 10.34.7:
`npm exec --offline --cache /private/tmp/clocktower-npm-cache --yes --package=node@24 --package=pnpm@10.34.7 -- …`.
Browser checks used `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clocktower-browsers CT_E2E_NO_BUILD=1 E2E_VOICE=0`
and the isolated server/database at `127.0.0.1:3398`.

| Executed command / check | Result |
|---|---|
| `node --import tsx packages/assets/scripts/hd/import-brianbi.ts` | Initial validation rejected a source row boundary that would clip a figure. Changed packing to use transparent gutters; rerun passed with 40 complete frames. |
| `node --import tsx packages/assets/scripts/generate.ts` | Passed; regenerated the small and HD character sheets, ghost variants, and social portraits. |
| `pnpm typecheck` | Passed across all seven packages, including the final NPC changes. |
| `pnpm build` and subsequent `pnpm --filter @ct/client build` | Passed; final client build served by the local preview. |
| `pnpm exec vitest run packages/assets/test/hdCast.test.ts apps/client/test/castPicker.test.ts` | 10 passed. Checks frame padding, distinct poses, atlas/manifest correspondence, and roster helpers. |
| `pnpm exec vitest run apps/client/test/npcRoaming.test.ts apps/client/test/castPicker.test.ts packages/assets/test/hdCast.test.ts` | 15 passed. Includes 3 minutes of simulated continuous chasing, return to home, blocked paths, and walkable escape routes around all four actual NPC homes. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Passed, including the final browser-test changes. |
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts hd-cast.spec.ts` | First repair run passed (14.8s test time). Final run with NPC behavior and portrait changes passed (17.4s / 19.0s total). Real picker; correct torso click target; advancing walk frames; idle on release; down-right animation; live reduced-motion toggle; sweeper avoidance; all NPCs within their fixed 48px home radii; cottage entry/exit at 2/3 scale; HD ghost; no page errors. |
| Manual Chrome preview at `http://localhost:3002` | Initially reproduced rejection of Brianbi by the old server process started before the roster change. Restarted only the local preview with the rebuilt server and existing DB. Brianbi selection then saved successfully and was visibly rendered in the new playground. Refreshed the final client with NPC behavior. |
| `curl -s http://127.0.0.1:3002/healthz` | Passed: development / local-preview / ok. |
| `git diff --check` | Passed. |

Visual checks: inspected all eight directions and five poses in `packages/assets/art/brianbi.png`,
plus in-game indoor and ghost screenshots. The built-in imagegen source and selected prompt set
are retained in `packages/assets/art/`. NPCs react only to visible, living, outdoor Brianbi
avatars during daytime phases; they remain client-local cosmetic townsfolk. The artwork retains
the original photoreal style and asymmetric footwear, using a short four-frame walk cycle.

## 2026-10-16 — Brianbi visual/integration review

Reviewed the uncommitted HD character on the editing Mac using the existing Node 24 / pnpm wrapper
and isolated Playwright server. No model or game-code edits made during this review.

| Executed command | Result |
|---|---|
| `pnpm --filter @ct/client typecheck` | Passed. |
| `pnpm vitest run apps/client/test/castPicker.test.ts --maxWorkers=1` | 8 passed. |
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts hd-cast.spec.ts` (existing built client, voice disabled) | Passed, 21.7s test time. Picker, town, walking, indoor and ghost screenshots inspected. |
| Temporary `brianbi-review-probe.spec.ts` via the same Playwright config, output `/private/tmp/clocktower-brianbi-review` | Passed as an observational probe. Right-clicking 18 world pixels above Brianbi's feet selected another player instead of Brianbi; clicking 2 pixels above his feet selected Brianbi. Confirms the HD texture scale is incorrectly reused for character hitboxes. Temporary spec removed after execution. |

Review findings: the down-right image faces left; several source-sheet crops clip hair; HD social
hitboxes and head attachments use texture scale (0.2) instead of world character scale (1); walking
has only a bob/sway on one pose per direction. These are not covered by the existing HD smoke test.

## 2026-10-16 — door rejection after refreshing

Run on the editing Mac using the Node 24 / pnpm wrapper and isolated browser-test settings below.
The production change restores the client's movement sequence from server teleports and snapshot
acknowledgements. A refreshed scene previously restarted at zero while the server retained the old
counter, silently ignoring movement and rejecting doors at the client's apparent position.

| Executed command | Result |
|---|---|
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts door-reconnect.spec.ts` (before fix) | Reproduced: after a reload with a retained movement sequence, the character walked to Wychwood but stayed outdoors. The captured browser trace shows the exact `Too far from the door.` alert. |
| `pnpm --filter @ct/client build` | Passed; rebuilt the local preview assets. Existing Zod annotation and VoiceClient import warnings remain. |
| `pnpm --filter @ct/client typecheck` | Passed. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Passed. |
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts door-reconnect.spec.ts doors.spec.ts` | Reload regression passed (9.5s): click and keyboard entry after separate reloads, first movement sequence newer than the retained server sequence, no door errors. Existing offset fixture failed before entry because its 10px keyboard positioning overshot to 16.5px at 30fps, exceeding its 16px setup assertion. Allowed up to 18px in that assertion; production door ranges unchanged. |
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts doors.spec.ts` | Passed (28.1s): centered and both off-center approaches at Wychwood, Weaver's House, and Ravenscroft; immediate re-entry tap; no door errors. |
| `curl --fail --silent http://127.0.0.1:3002/healthz` | Passed: development / local-preview / ok. |
| `git diff --check` | Passed. |

## 2026-10-16 — full house-sign occupant lists

Run on the editing Mac for the user's local preview, using Node 24.22.0 and pnpm 10.34.7 via
`npm exec --offline --cache /private/tmp/clocktower-npm-cache --yes --package=node@24 --package=pnpm@10.34.7 -- …`.
Browser checks use a throwaway server/database on `127.0.0.1:3398` and
`PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clocktower-browsers CT_E2E_NO_BUILD=1 E2E_VOICE=0`.

| Executed command | Result |
|---|---|
| `pnpm --filter @ct/client build` | Passed before and after the change; existing Zod annotation and VoiceClient import warnings remain. Rebuilt the assets served by the local preview. |
| `pnpm --filter @ct/client typecheck` | Passed. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Passed. |
| `pnpm exec playwright test -c tests/e2e/playwright.config.ts door-boards.spec.ts` | Before the fix, failed on the fifth guest: the sign displayed `+1 more` instead of their name. After the fix, five-guest coverage passed; full-lobby coverage with fourteen guests and an outdoor reader also passed. Tests cover Wychwood, Weaver's House, Ravenscroft, successive arrivals, real door leave/re-entry, clearing empty houses, readable line heights, phone bounds, hidden Storyteller visits, the door-tag setting, and hiding signs at night. Desktop and phone screenshots inspected. |
| `curl --fail --silent http://127.0.0.1:3002/healthz` | Passed: development / local-preview / ok. |
| `git diff --check` | Passed. |

The server already supplies every occupant. The text boards now use that full list instead of the
four-portrait subset, refresh for changes anywhere in the roster, and hang names downward from the
sign instead of growing upward over the roof. Existing server privacy rules are unchanged.

## 2026-10-16 — photo-real roster character `brianbi`

Run on the editing Mac (the host still does not resolve; user approved local runs). Same Node 24.22.0 /
pnpm 10.34.7 `npm exec --offline …` wrapper and Playwright env as the entry below. Art: the user's
turnaround sheet, right shoe removed with `codex exec -m gpt-6-sol` image edits (raw inputs/outputs in
gitignored `packages/assets/ai/staging/brianbi/`), cut out with `packages/assets/scripts/hd/brianbi_cutout.py`
(Pillow/numpy/scipy in a throwaway venv) into `packages/assets/art/brianbi.png`.

| Executed command | Result |
|---|---|
| `pnpm assets:generate` | Passed. Changed only cast.png/json, social.png/json; new cast-hd.png (455 KiB) / cast-hd.json. |
| `pnpm typecheck` | Passed all workspace packages. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Passed. |
| `pnpm vitest run packages/assets apps/server/test/{auth,room,records.game,playtest.persistence,world.room}.test.ts --maxWorkers=1` | 79 passed, 3 skipped (pre-existing `ambient.test.ts` skips). |
| `pnpm test --maxWorkers=2` | 647 passed, 7 skipped, 2 failed: `castPicker.test.ts` roster count (13 → 14 villagers; test updated, rerun: client tests 59/59 passed) and `review-probes` SR-1, which reads `/proc/<pid>/status` and cannot run on macOS (unrelated; not rerun on Linux). |
| `pnpm build` | Passed. |
| `pnpm exec playwright test … hd-cast` | First run: picker/town/walk/indoor steps passed, then a raw Leave click during the door cooldown failed; switched to `leaveByButton`. Rerun **1 passed (12.6s)**: picked via the real picker, HD sheet fetched, town/walking/indoors/ghost screenshots inspected, no page errors. |

## 2026-10-16 — local preview, room chat, walkable cottages, and doorway regression

Run on the editing Mac for the user's explicitly requested local preview. The documented SSH alias
and full hostname for the host did not resolve. Native preview: `127.0.0.1:3002`, isolated `data/local`;
browser tests: throwaway server/database on `127.0.0.1:3398`. No shared deployment.

Commands below use Node 24.22.0 and pnpm 10.34.7 via
`npm exec --offline --cache /private/tmp/clocktower-npm-cache --yes --package=node@24 --package=pnpm@10.34.7 -- …`.
Playwright commands set `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clocktower-browsers CT_E2E_NO_BUILD=1 E2E_VOICE=0`
and use `-c tests/e2e/playwright.config.ts`. Local socket/browser runs required sandbox escalation.

| Executed command | Result |
|---|---|
| `pnpm typecheck` | Passed all workspace packages. |
| `pnpm --filter @ct/client typecheck` | Passed after indoor scaling, bubble stacking, and door changes. |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | Initial new-test import of `@ct/assets` failed root resolution; switched to the existing source-relative convention. Subsequent runs passed. |
| `pnpm build` | Passed, including repeated rebuilds to update the local preview. Existing Zod annotation and mixed static/dynamic VoiceClient import warnings remain. |
| `pnpm vitest run apps/server/test/room.test.ts apps/server/test/world.test.ts apps/server/test/world.stage.test.ts packages/assets/test/navigation.test.ts --maxWorkers=2` | 69 tests passed. Room suite could not bind port 3331 inside the sandbox; its 20 tests were skipped in this attempt. |
| `pnpm vitest run apps/server/test/room.test.ts --maxWorkers=1` (escalated) | 20 passed: includes waiting/day/finished chat audience isolation and existing spam limits. Total targeted unit/integration checks: 89 passed. |
| `pnpm exec playwright test … chat-bubbles` | Initial run lacked Chromium; installed into the temporary browser directory. Next run reached phone walking but hit an ambiguous Leave locator; scoped it to the cottage. A later run passed stacking/walking and failed a test assumption: forcing the first night yields `first_night`, not `night`; fixed the expectation. Subsequent runs passed. |
| `pnpm exec playwright test … chat-bubbles.spec.ts doors.spec.ts` | Chat test passed in both combined runs: independent five-second expiry, newest-three cap, escaped text, private waiting/night/finished chat, Storyteller replies, departure cleanup, keyboard and phone floor-tap walking, bubble bounds, no page errors. Door fixture failures described below. |
| `pnpm exec playwright test … doors.spec.ts` (initial iterations) | Reproduced the original trigger failure: feet 12px off-centre against the wall, still outdoors. Test setup then exposed seat-dependent stage-teleport offsets and the fountain blocking a straight approach to Ravenscroft. Switched to leaving onto the doorstep and moving sideways. A 30fps frame overshot the requested 10px offset to 15px; that also exposed the intermediate 16px trigger missing at the wall. Final trigger uses 20px, within the unchanged 22px server range. |
| `pnpm exec playwright test … chat-bubbles.spec.ts doors.spec.ts` (final build) | **2 passed, 52.5s.** Door coverage: Wychwood, Weaver’s House, Ravenscroft, centered and both off-center approaches, immediate leave/re-enter tap during cooldown, no door errors. Chat coverage above passed again, with desktop/phone screenshots inspected. |
| Collision probe via `pnpm exec tsx -e …`, then `node --import tsx --input-type=module -e …` | First attempt blocked by the sandbox's IPC restriction; loader form succeeded. Confirmed the fountain collision south of Ravenscroft, while the immediate doorstep is clear. |
| `docker compose config --quiet` | Passed. Docker image/runtime not tested: CLI exists, Docker Desktop/daemon is unavailable on this Mac. Native preview runs successfully. |
| `curl --fail --silent http://127.0.0.1:3002/healthz` | Passed: development / local-preview / ok. |
| `git diff --check` | Passed. |

Existing chat/point/pin token-bucket limits were deliberately retained at the user's request.
The broader full-game/chaos/phone suites had their changed indoor controls/text expectations updated;
those full suites were not rerun in this session. LiveKit audio was not exercised.

## 2026-10-14 — M0 (lead)

| Command | Result |
|---|---|
| `ssh <host> 'uname -a; cat /etc/os-release; …'` | ✅ Ubuntu 22.04.5 x86_64, Tailscale 1.102.2, no Node |
| Node v24.22.0 tarball install (sha256 verified) + `npm i -g pnpm@10` | ✅ node v24.22.0, pnpm 10.34.7 |
| `scripts/remote.sh node -e …` (first install incl. better-sqlite3 native build) | ✅ `node v24.22.0 on the host` |
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ❌ first run: ` ` literal broke regex in protocol/text.ts; ❌ Emitter generic constraint → fixed; ✅ all 7 packages pass |
| `pnpm --filter @ct/client build` | ✅ vite build 147 kB js |
| `pnpm --filter @ct/server build` | ✅ esbuild bundle |
| `node apps/server/dist/server.js` on :3399 + `curl /healthz`, `curl /lobby/abcdef` | ✅ `{"ok":true,"env":"test"}`, SPA index served for deep link |
| `scripts/remote.sh pnpm vitest run packages/protocol` | ❌ first run: wrong expectation in my collision test (wall row math) → fixed test; ✅ 9/9 passed |

## 2026-10-14 — integration after voice + lobby-auth (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm -r --no-bail run typecheck` | ✅ 7/7 packages |
| `pnpm vitest run packages apps` | ✅ 14 files, 202 tests passed (rules work-in-progress included) |
| `pnpm --filter @ct/client build` / `@ct/server build` | ✅ (client bundle 898 kB, Phaser included) |
| `node apps/server/dist/server.js` on :3301, `curl /healthz`, `POST /api/auth/create` | ✅ after adding `livekit-server-sdk` to @ct/server deps (bundle previously failed to start — reported by lobby-auth) |

## 2026-10-14 — qa-deploy: services, deploy pipeline, harness, security, E2E, load

Host facts at start: `Linger=no`; `tailscale funnel status` → `No serve config`; no `funnel` node capability;
no Tailscale operator set; memory cgroup delegated to the user manager; `google-chrome` 143 present; no `jq`/`sqlite3` (python3 used).

| Command | Result |
|---|---|
| `scripts/setup-hshi-u1.sh` | ✅ layout, `env/{dev,prod}.env` (600, secrets generated on host, distinct per env), 4 units installed; dev/prod enabled; backup timer active |
| `scripts/deploy-hshi-u1.sh dev` (ae17ec6) | ❌ root `pnpm build` fails: unquoted `./packages/*` glob expanded by sh → `None of the selected packages has a "./packages/db" script`; deploy switched to `pnpm -r --if-present run build` → ✅ healthy `version=ae17ec6…` in 3 s |
| `scripts/deploy-hshi-u1.sh prod` (HEAD, dirty tracked files) | ✅ refused as designed |
| `scripts/deploy-hshi-u1.sh prod ae17ec6…` | ✅ healthy `env=production version=ae17ec6…` |
| Rollback test: broken release (fake sha `deadbeef…`, server throws on start) via `install-release.sh prod` | ❌ 1st: crash loop hit StartLimitBurst → rollback restart refused, prod down → fixed (`reset-failed` + health-check of previous) and restored prod; ✅ 2nd: exit 1, auto-rollback to ae17ec6, healthy; dev MainPID unchanged |
| `tailscale funnel --bg 3000` (timeout 20) | ❌ `Funnel is enabled, but the list of allowed nodes in the tailnet policy file does not include the one you are using.` + admin link; status still `No serve config` |
| `scripts/verify-public-endpoint.sh` (from Mac) | ❌ public DNS NXDOMAIN (Funnel inactive); ✅ funnel config never targets :3001; ✅ :3001 loopback-only; ✅ tailnet IP :3001 and :3000 refused |
| `curl` WS upgrade to `127.0.0.1:3000/verifyproc/verifyroom` on host | ✅ `HTTP/1.1 101 Switching Protocols` |
| `smoke-test.sh http://127.0.0.1:3001` (ae17ec6, stub API) | ✅ 5 pass, 2 pending (API 404), exit 3 |
| `pnpm exec tsc -p tests/tsconfig.json` | ✅ |
| `pnpm vitest run tests/` (1st, working tree with lobby-auth WIP) | ❌ 61 pass / 2 fail / 1 skip: (a) my XSS fixture was 25 chars (>24 limit) → fixed; (b) harness port race between parallel files (loser's health probe hit the winner's server) → fixed with per-launch version nonce |
| `pnpm vitest run tests/security/leakage.test.ts` | ❌ night-visit step: visit is presence-based (WorldModule stub) → split into its own test gated on world feature; ✅ 2 pass, 1 skip |
| `pnpm exec playwright install chromium` (no sudo) + `ldd` on both binaries | ✅ chromium-1243 + headless shell; all shared libs found (no `install-deps` needed) |
| `pnpm test:e2e` | ❌ 1st: client build failed (`./lobby.css` missing, lobby-auth mid-edit); ❌ 2nd: my selector ambiguous (host name in header) → scoped; ✅ 5/5 passed (accounts, create lobby, finder join w/ XSS-name literal, share-URL rejoin, member list + leave) |
| `pnpm test:load -- --lobbies 1 --players 5 --duration 10 --mode dist` | ❌ dist bundle: `Cannot find package 'livekit-server-sdk'` (not in @ct/server deps at that time; since fixed by lead) → ran `--mode source` ✅ |
| `scripts/backup-db.sh` on scratch HOME (WAL DB, 1000 rows) | ❌ exit 2 after a successful backup (`ls` glob + pipefail in retention) → fixed with `find`; ✅ 16 runs → 14 kept + 1 tagged, mode 600, restore = 1000 rows; `systemctl --user start clocktower-backup.service` → Result=success |
| `scripts/deploy-hshi-u1.sh dev` (f2dcfba) | ✅ migrations applied to `data/dev` only (prod data dir untouched), healthy in 6 s |
| `smoke-test.sh http://127.0.0.1:3001` (f2dcfba) | ✅ 16/16 pass (account, cookie HttpOnly, lobby, list, ticket, SSE, sign-out revocation) |
| `LOCAL_PORT=13001 scripts/dev.sh` + `smoke-test.sh http://localhost:13001 --no-lobby` (Mac, via SSH forward) | ✅ 12/12 pass |
| `scripts/deploy-hshi-u1.sh prod f2dcfba…` then again (reuse) | ✅ prod migrated its own DB; 2nd run reused release, took `predeploy` backup, healthy in 2 s; dev MainPID unchanged |
| `smoke-test.sh http://127.0.0.1:3000 --no-lobby` (on host) | ✅ all pass, `env=production` |
| `pnpm vitest run tests/` (final) | ✅ 11 files, **64 passed, 1 skipped** (night-visit secrecy: WorldModule pending) in ~70 s |
| `pnpm test:load -- --lobbies 2 --players 15 --duration 60` (dist) | ✅ 32 clients, 0 errors: server CPU avg 2.1% / max 4% of one core, RSS 222→252 MB, C2S 289 msg/s, S2C 426 msg/s, RTT p50 0.7 / p99 1.4 ms. ⚠ world snapshots empty (WorldModule stub) |
| `pnpm test:load -- --lobbies 4 --players 15 --duration 60` (dist) | ✅ 64 clients, 0 errors: CPU avg 3% / max 6%, RSS ~243 MB, C2S 573 msg/s, S2C 852 msg/s, 38 KB/s S2C, RTT p50 1.0 / p99 1.7 ms. ⚠ same caveat |

## 2026-10-14 — after qa-deploy (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm build` | ✅ after fixing root build script (unquoted glob → `pnpm -r --if-present run build`) |
| `scripts/remote.sh pnpm vitest run` (all suites) | ✅ 27 files, 294 tests passed |

## 2026-10-15 — world-art integrated (lead)

| Command | Result |
|---|---|
| `scripts/remote.sh pnpm -r run typecheck` | ✅ all packages |
| `scripts/remote.sh pnpm vitest run` | ✅ 27 files, 294 tests (night-visit secrecy test now active with real WorldModule) |
| `scripts/remote.sh pnpm build` | ✅ client + server |
| world-art: Playwright 2-browser check vs test server :3320 (reported by teammate) | ✅ town renders, remote movement visible |

## 2026-10-15 — public ingress via Cloudflare Tunnel (lead)

Public URL: **https://clocktower.chrisshi.com** (Cloudflare Tunnel `clocktower`, id 42b1c7f4…, from
the host → 127.0.0.1:3000 only). Funnel not used (tailnet policy approval not granted).

| Command | Result |
|---|---|
| cloudflared 2026.10.0 binary install on the host (sha256 matched GitHub digest) | ✅ |
| `cloudflared tunnel create clocktower`; `tunnel route dns clocktower clocktower.chrisshi.com` | ✅ CNAME added |
| `cloudflared tunnel --config … ingress validate` / `ingress rule` | ✅ only clocktower.chrisshi.com → 127.0.0.1:3000; other hosts → 404 |
| `scripts/deploy-hshi-u1.sh prod c60ba22…` (after setting prod APP_PUBLIC_ORIGIN) | ✅ healthy; dev MainPID unchanged (3740957) |
| `systemctl --user enable --now clocktower-tunnel` | ✅ active, 4 QUIC connections (sjc) |
| From the Mac via Cloudflare edge (IPv4 pinned): `/healthz`, `/lobby/<id>` SPA, `/favicon.png`, unauthenticated `/api/lobbies` & `/api/admin/status` | ✅ 200 prod c60ba22 / 200 html / 200 png / 401 / 401; headers nosniff + DENY |
| First attempt from the Mac with system DNS | ❌ local Tailscale MagicDNS cached the pre-creation NXDOMAIN (only AAAA returned; no IPv6 route) — environment, not server |
| `nc -z <tailscale-ip> 3001`; `ss -ltn` on the host | ✅ dev not reachable on tailnet IP; 3000/3001 bound to 127.0.0.1 only |
| lobby.spec.ts against public URL | ❌ Node-side API helper hit the same stale-DNS IPv6-only answer (ENETUNREACH); browser steps passed |
| Throwaway public-check spec (2 Chromium contexts, IPv4 pinned via host-resolver-rules, real TLS/hostname) | ✅ accounts created; cookie Secure+HttpOnly+SameSite=Lax; lobby created; share URL `https://clocktower.chrisshi.com/lobby/…`; both browsers saw both members over WSS; movement; leave. Screenshot: docs/screenshots/public-waiting-room.png. Left 2 `verify-*` accounts in prod DB. |

## 2026-10-15 — real LiveKit Cloud (lead)

User stored prod credentials via `ssh -t <host> '~/clocktower/bin/set-livekit.sh prod'` (env file 0600; secret never printed). Dev not yet configured.

| Command | Result |
|---|---|
| `LIVEKIT_ROOM_PREFIX=livecheck tsx packages/voice/scripts/livekit-live-check.ts` (prod creds, isolated prefix) | ❌ 7/8: "token for room A is accepted" — script bug: `/rtc/v1/validate` answers a VALID token with 400 `join_request is required` and the script only fell back on 404 (probe: `/rtc/validate` → 200 success) |
| same after fixing endpoint order | ✅ 8/8: valid token accepted; token edited to room B → 401; wrong-secret token → 401; signalling join OK; participant listed in A only; `removeParticipant` disconnects (ws 1006) |

## 2026-10-15 — host hardening applied (lead)

User ran `ssh -t <host> 'sudo bash ~/clocktower/hardening/deploy/secure/setup-dedicated-user.sh --apply'` (dry run reviewed first).

| Check | Result |
|---|---|
| prod/dev/tunnel process identity (`/proc/<pid>/status`) | ✅ uid/gid 998 `clocktower`, Groups 998 only (no sudo/adm/lxd), CapEff 0, NoNewPrivs 1, Seccomp 2 |
| `systemd-analyze security` prod/dev/tunnel | ✅ 1.5 OK each (was 9.6 UNSAFE for the user unit) |
| `systemctl show clocktower-prod` | ✅ ProtectHome=yes, ProtectSystem=strict, RW only /srv/clocktower/data/prod, other env data/backups/env/tunnel creds inaccessible, MemoryMax 1.5G, CPU 300%, TasksMax 256 |
| /home/<admin> 0750 <admin>:<admin>, ~/.ssh 0700 | ✅ uid 998 has no access even without the sandbox |
| listening ports | ✅ 3000/3001/20241 on 127.0.0.1 only |
| `sudo -n -l` as admin | ✅ NOPASSWD only for restart/stop/reset-failed of the 3 units + 2 backup units |
| public `https://clocktower.chrisshi.com/healthz` | ✅ |
| `scripts/deploy-hshi-u1.sh dev` (system mode) | ❌ first: sudo rule mismatch (`clocktower-dev` vs `clocktower-dev.service`) → fixed; ✅ 0d72569 healthy |
| `scripts/deploy-hshi-u1.sh prod 0d72569` | ✅ sandboxed pre-deploy backup ran (integrity ok), prod healthy, dev PID unchanged; admin cannot list /srv/clocktower/backups/prod (by design) |

## 2026-10-15 — qa-deploy round 2: M3 browser round, load with real world, public endpoint, resilience, soak, adversity

Everything below ran on the host (test instances on 3350-3399 unless stated otherwise).

| Command | Result |
|---|---|
| `playwright test … m3-round` (6 Chromium contexts, built client, :3398) | ❌ 1st: per-IP sign-up limit (“Too many attempts”) — six browsers share 127.0.0.1 → each context now sends its own X-Forwarded-For; ❌ 2nd: 5th player’s first Ready click not acknowledged; ❌ 3rd: a “Raise hand” click arrived after the 1.5 s clock hand passed (button gone) → bounded clicks; ✅ 4th/5th: **all 15 steps pass, all UI-driven** (accounts, lobby, ready, start, random setup, first night, night isolation via frame decode, Visit, visited-only ST entity/“The Storyteller is in your home”, day, nominate, vote, execute→ghost with ghost vote, Good wins, reveal on all 6 clients, no ST-only fields). Ready diagnostic: `lobby:ready frames sent: 0` on the unacknowledged click (client-side) |
| `pnpm test:e2e` (lobby + m3) | ✅ 5/5 + 1/1 (run then stopped while it continued into teammates’ voice-live/ux specs) |
| `tests/load/inspect-snapshots.ts` (real WorldModule) | ✅ moves accepted, 0 corrections, 4 entities/snapshot |
| `pnpm test:load -- --lobbies 2 --players 15 --duration 120` (bots path-find + leave homes) | ✅ 32 clients, 0 errors/disconnects, 32/32 outdoors, 16 entities/snapshot, 0 corrections; server CPU avg 3.1% / max 11% of 1 core; RSS ~244-248 MB; C2S 320 msg/s, S2C 421 msg/s; **S2C 435 KB/s (3.56 Mbit/s), 13.6 KB/s per client**, p95 448 KB/s; RTT p50 0.5 / p99 3.1 ms |
| `pnpm test:load -- --lobbies 4 --players 15 --duration 120` | ✅ 64 clients, 0 errors; CPU avg 4.9% / max 13%; RSS ~248 MB; C2S 629 / S2C 842 msg/s; **S2C 869 KB/s (7.12 Mbit/s)**, p95 878; RTT p50 0.6 / p99 3.1 ms |
| `scripts/verify-public-endpoint.sh` (→ https://clocktower.chrisshi.com) | ✅ 0 failed / 1 skipped (Funnel) — DNS via 1.1.1.1, TLS (GTS WE1), healthz prod, SPA, headers at edge, WSS 101, dev not exposed. Re-run after host hardening (system units, live tunnel ingress from cloudflared /config) ✅ |
| `scripts/smoke-test.sh --no-lobby --expect-version c60ba22…` (public URL) | ✅ 12/12 (1 prod account) |
| ⚠ my cookie-name probe `curl -X POST 127.0.0.1:{3001,3000}/api/auth/create` | **mistake: created one stray account "x" on dev and one on PROD** (reported to lead for cleanup) |
| isolation re-check (env files, process environ, DB files, LiveKit presence) | ✅ separate; prod LiveKit set, dev not; all units enabled |
| `tests/integration/adversity.test.ts` (netem proxy: 150±50 ms, 3% stalls; races) | ❌ initial: flaky (WS 1006 / canStart timeouts). Root cause **in the harness**: proxy reordered TCP chunks (per-chunk setTimeout ties across timer buckets) — server logged “member joined” while the client socket errored. Fixed (FIFO queue); standalone repro 3/8 → 0/20 failures; latency test ✅ 10/10, network-drop ✅ 8/8, last-slot ✅ 5/5 (now judged from server state). Measured: RTT p50 ~335 ms, **~2.8% of valid moves corrected (rubber-banding) under loss stalls**, full drop → all reconnect to same seats in ~330 ms |
| `tests/integration/directory.test.ts` | ✅ 3/3 ×3: SSE latency 30-62 ms for leave/rejoin/start/night/day/finished/rematch/empty; stale-tab resync snapshot == list; heartbeat every 20 s; empty lobby removed after idle timeout (10.9 s at 10 s setting) |
| `tests/security/adversarial.test.ts` | ❌ initial: my bots auto-voted randomly; my ghost/nominee choice hit Imp/Virgin rules → fixed role selection + `confirm_result` handling; ✅ 7/7 ×5 (forged st:command, votes for other seats/double/after lock, one ghost vote, teleports + night exit, move flood, forged prompts, 9-player full game scan: no foreign character/alignment/poison/visit) |
| `tests/security/logs.test.ts` (fake LiveKit creds, full game) | ✅ no passphrases/session tokens/tickets/LiveKit tokens/secrets or player↔character ties in logs; 58 JSON lines, lobbyId on 46, pid on 39, **0 phase/nomination/ST-command lines** |
| `tests/load/soak.ts -- --minutes 30 --workers 3` | ✅ 531 cycles (389 games, 172 rematches, 141 switches, 142 drops), 1 failed cycle (5 s “finished” wait; pending-result handling added since); heap 38-91 MB oscillating, idle 64 → 36 MB; RSS idle 231 → 144 MB; fds 27 → 27; lobbies → 0. **No leak** |
| `tests/resilience/crash-restart.ts --mode test` (transient unit, SIGKILL) ×2 | ✅ ran: restart 2.5-2.8 s; browser “Connection lost — reconnecting…” ~60 s then “Your seat is kept … Reconnect” (lobby gone); bots 1006, reconnect “room disposed”, ticket 404, sessions valid; reload → “Lobby not found” |
| `… --mode dev` (`sudo -n systemctl restart clocktower-dev.service`) | ✅ ran: healthy in 1.9 s; close 4000; **browser shows no indication for 90 s** (dead game with live controls); reload → “Lobby not found” |
| `E2E_PUBLIC=1 E2E_TUNNEL_RESTART=1 playwright test` (public.spec, 2 prod accounts) | ✅ 4/4: secure context + getUserMedia, assets 200, `__Host-ct_session` Secure/HttpOnly/Lax/30 d, wss://clocktower.chrisshi.com, share-link join; tunnel restart (command blocked ~30 s) → both reconnected to the same seats ~36 s after start; both left, lobby 0/10 |
| final regression, current tree (after playtest 6e46820 / prod 7639655): `pnpm vitest run tests/` | ✅ 16 files passed + 1 skipped (not qa-owned); **100 passed, 1 skipped** |
| final regression: `playwright test lobby m3-round` | lobby ✅ 5/5. M3 ❌ ×2 under host load avg 28-35 (other agents’ headless Chromium runs): run 1 hit the 10-min test timeout (Ready alone 455 s); run 2 (20-min budget, smaller player viewports) passed accounts→lobby→ready→start→setup→first night→night isolation→Visit→visited-only secrecy→day→nomination, then failed at the vote tally (Raise-hand clicks slower than the 1.5 s/seat clock hand). M3 is **verified at c60ba22 (2 full passes), not re-verified at current HEAD**. Ready-click diagnostic recurred (3 players: 0 `lobby:ready` frames sent on first click) |

## 2026-10-15 — voice2 live LiveKit results (SIMULATED microphones; summary by lead)

All against a private test server (prefix `voicetest`), never dev/prod. Fake mic = speech-like WAV (Chromium) / built-in tone (Firefox). ✅ square, street falloff, square-boundary hysteresis (0 switches parked/jittering), building isolation, adjacent houses at night, ST visit privacy (third player never sees ST), 0 ms residual audio on room exit, revoked-token replay swept, cross-lobby token 401, quota counter, 10 simultaneous talkers (LiveKit "excellent"), device switch/refresh/permission-denied/no-mic recovery, Firefox. ❌/not run: WebKit (missing system libs), 15 talkers (budget), real network drop (Playwright offline only cuts signalling), any REAL microphone. Quota: 328 participant-minutes used (budget was 250).

## 2026-10-15 — core gameplay finalized (lead)

Commit **16042fe** (prod + dev). Verified on the host against that exact commit (clean `git archive` tree):

| Check | Result |
|---|---|
| `pnpm -r run typecheck`, `pnpm -r --if-present run build` | ✅ |
| `pnpm vitest run` (all suites) | ✅ 533 passed, 4 skipped (art-dependent ambient/egg tests skip until the art overhaul lands) |
| e2e `game-full.spec.ts` (1 ST + 5 players, real UI: join → setup → walk home → night visits → walk out → gather/circle → early hands + vote clock → execution → ghost vote → overrides → pending result → Confirm → reveal → Play again) | ✅ all 30 steps, runs g2 + g3 (g1 failed on the test's keyboard walker; fixed) |
| e2e `game-chaos.spec.ts` (Ready mashing, duplicate tab, refreshes at bedtime/mid-prompt/mid-vote, tab closed during escort, ST refresh mid-visit, simultaneous nominations, out-of-order ST, wrong house, walking out at night) | ✅ all cases, runs h1 + h2 (h3: one test timeout on a CPU-starved page; check aligned to 60 s) |
| Night secrecy in decoded frames (no ST entity / visit cue / visiting flag for unvisited players) | ✅ |
| B1 (refresh mid-vote) | Root cause on this host: a CPU-starved software-rendered page stops reading its socket ~45 s; server watchdog never fired (0 warns/errors in all logs); client watchdog recovers. Single-browser: no freeze. |
| prod deploy 16042fe (active-game guard), public `/healthz`, SPA, `/internal/active-games` 404 via tunnel, `smoke-test.sh` public | ✅ |

## 2026-10-15 — v2 e2e (one-screen town, automatic doors, tap-a-cottage, roster, st-ui script panel) — e2e agent

All on the host via `CT_AGENT=e2e scripts/remote.sh …`, throwaway server on 127.0.0.1:3398 (playwright webServer), ≤ 6 browser contexts per suite, one suite at a time. Client/server built from the working tree at HEAD **b83afac** (+ uncommitted test changes) at 15:10; earlier runs (marked †) used the 13:00 build of the pre-`7c4ec91` tree. The e2e server now gets **fake LiveKit credentials** (`tests/e2e/playwright.config.ts`, opt-out `E2E_VOICE=0`) so the real voice coordinator mints zone grants that specs decode (nobody connects).

What changed in the suites: `helpers.ts` (v2 sign-up picker "Choose your character"; camera-model tap helpers `tapCottage` / `tapLockedCottage` / `planCottageTap` mirroring TownScene's camera, every tap verified by its effect; `leaveByButton` / `leaveByKey`; `walkIntoDoor` (keyboard + automatic door, no E); frame-precise fine positioning `holdFrames` for 150 px/s; `voiceZone` / `zonesGranted`; `storytellerToolsMode` / `stPanelMode` for the st-ui panel), `game-full`, `game-chaos`, `lobby`, `ux-walkthrough` updated, new `v2-phone.spec.ts`.

| Command | Result |
|---|---|
| `playwright test … v2-phone` † (×3) | ❌ 1: strict-mode locator (portrait canvas also has `data-cast`) — test bug, fixed; ❌ 2: `tap()` on an `aria-disabled` taken tile waits forever (no actionTimeout) — fixed (force tap + `actionTimeout`); ✅ 3 (3.5 min) |
| `playwright test … game-full` † GAME_RUN=v2a | ❌ keyboard walker oscillated ±37 px around the door (Playwright key press lasts several frames on the starved page at 150 px/s) — harness fixed (`holdFrames`) |
| `playwright test … game-full` † GAME_RUN=v2b | ✅ all 31 steps (14.5 min) |
| `playwright test … game-chaos` † GAME_RUN=v2c | ✅ all 13 cases (13.6 min) |
| `playwright test … lobby ux-ready` † | lobby ❌ new roster test (bug B1 below); ux-ready ✅ (4.0 min) |
| `playwright test … ux-walkthrough` † | ❌ hung 30 min at the signed-out deep link: landing now shows "You've been invited / Join the game" (no "Create account") and the config has no actionTimeout — test fixed; run killed (also starved by a concurrent social-client suite) |
| `pnpm -r --if-present run build` (15:10, b83afac) | ✅ |
| `playwright test … v2-phone` | ✅ (3.6 min): portrait + landscape sign-up/pick, lobby re-pick, duplicate pick reassigned (picked `mole` → given `snail`), taken tile "taken by Pia", tap own cottage → in (5.2 s), **side cottage off-screen in portrait → 2 ground taps → cottage tap → in**, Leave button fits + not covered (portrait 140×40 at y 783; landscape at y 319), rotation while inside, two phones inside one cottage = `bld:house-1` zone, filler outdoors = `square` and never granted `bld:house-1` |
| `playwright test … game-full` GAME_RUN=v2d | ✅ 31 steps + soft notebook/story smoke (11.2 min). Random deal had no first-night info step → info via Grimoire fallback |
| `playwright test … game-chaos` GAME_RUN=v2e | ✅ 13/13 (5.2 min); N1: Leave disabled "You stay home until morning", arrow key sends nothing, injected `world:useDoor` → "You must stay home until morning." |
| `playwright test … lobby ux-ready` | lobby 5/6 ✅, ❌ `v2 roster … Storyteller's pick blocks nobody` (**bug B1**: "Greenting, UCT mascot, taken by Carol o8fkj"); ux-ready ✅ (2.1 min) |
| `playwright test … ux-walkthrough` (ux3) | ❌ "Begin first night" no longer exists → phases now via the script cues; ❌ (ux3) "Good wins" now asks to confirm → handled |
| `playwright test … game-full` GAME_RUN=v2f | ✅ (10.3 min) incl. **script panel night**: re-deal ("↻ Deal again") until the first night has Tell + Ask; ST clicks a cottage on the map (teleport_self, 1.1 s) → row "you are here" → **Tell them**; Leave button; **Go** + **Ask:** for the Fortune Teller; answer shown in the row; notebook (N) autosave/reopen, note never in another client's frames; ST Story panel; players have no pamphlets button |
| `playwright test … ux-walkthrough` (ux4, ux5) | ux4 ❌ "Joining lobby…" > 10 s for a player moving to a second lobby on the loaded host (timeout raised to 60 s, as elsewhere); ux5 ✅ (7.4 min): v2 home picker, inside panel + Leave (desktop + phone), joystick after leaving (6 move frames, +60 px), reconnect banner, script cues for night/dawn/day, endgame confirm; **0 overlay overlaps, 0 console/CSP errors**; ≤ 6 contexts (decoy/ST/phone/late closed when done). Screenshots `test-results/ux/v2/` |

Game-full v2 coverage (decoded frames + UI): tap own cottage at bedtime (walk + `world:useDoor`, only door/correction teleports); keyboard walk INTO the doorway (no E); escorts; ST click-to-teleport visit with `storyteller` teleport reason; unvisited players see no ST entity / cue / flag; Leave button and arrow-key leave at dawn; **private talk**: guest taps host's cottage, both granted `bld:<house>` zone, outsider stays `square`, never granted it, sees neither entity, and the door board (doorTags) lists both; votes/ghost vote/undo; ST teleport into a cottage; door lock → Leave disabled "… is locked by the Storyteller", arrow key sends nothing, injected door request refused with toast; an outdoors player tapping the locked cottage walks to it and gets the message, stays out; freeze; force night; endgame; rematch; no ST-only keys in any player frame.

Bugs found (details in the e2e report): B1 roster picker greys out the Storyteller's character (client `takenBy` ≠ server rule); B2 script panel says "✓ Every visit is done." while a visit is still open (1/2 done); B3 phone landscape: joystick overlaps the Chat button, lobby chat covers the movement hint, waiting-room picker clipped; B4 inside panel covers the occupants on short screens (720×450, 844×390) and the bedtime "You are home" compass; occupants' name labels overlap; B5 engine "Game end detected … Confirm" alert still shown after the result was confirmed; B6 Story labels the pre-first-night bedtime "Day 0". Screenshots: `docs/screenshots/v2-e2e-*.png`; step logs `tests/e2e/artifacts/game-full-steps-v2{b,d,f}.json`, `game-chaos-v2{c,e}.json`.

### 2026-10-15 (later) — e2e helpers on the camera hook; runs on e5d31ef (e2e agent)

`tests/e2e/helpers.ts` now taps through the client's opt-in camera hook (`localStorage ct.debug.camera = '1'` set by `installSocketTap` → `window.__ctCamera.worldToScreen / view`); `outdoorCamera` remains only as a fallback (updated to the v2.1 SQUARE_VIEW maths); `settle` waits for `view()` to stop moving. `v2-social.spec.ts` `toScreen` switched to the hook too. `pnpm exec tsc -p tests/tsconfig.json --noEmit` ✅ (0 errors).

Clean `git archive e5d31ef` + the new helpers.ts (sandbox `e2e-head`), build ✅:

| Suite | Result |
|---|---|
| `v2-phone` | ❌ landscape: the open lobby chat (`.ct-chat-list` / chat input) intercepted the tap on "Change character…" in the waiting-room sheet (real bug; lead fixed in 9fd63ec — not re-run here at the lead's request) |
| `game-full` GAME_RUN=h1 | ✅ (12.3 min); every tap resolved through the hook (0 "no camera hook" fallbacks in `game-full-steps-h1.json`) |
| `lobby` | ✅ 6/6 — the roster test now passes (B1 fixed: the Storyteller's character is no longer shown as taken) |

### 2026-10-15 — v2.1 (town clock + automatic games), lead

| Command (the host, sandbox `lead`) | Result |
|---|---|
| `pnpm -r run typecheck` | ✅ |
| `pnpm test` | ❌ 1/724: `tests/security/leakage.test.ts` lobby summary keys did not allow the new optional `storytellerMode`/`autoTimings` (public lobby settings) — test updated; `vitest run tests/security` ✅ 70/70 |
| `playwright test … v21-clock` | human test ✅; automatic test ❌ after the host's abort the players' clients kept showing the aborted game (client only dropped a *finished* game's view) — fixed in `net/room.ts` (drop the game view when the lobby goes back to waiting) |
| `playwright test … v21-clock -g automatic` (×2) | ✅ (2.8 min): create automatic lobby, finder badge, auto deal → day clock, chip + tower dial, +2 min proposal voted through (clock +120 s), phone chip/vote card, host abort → waiting room. Second run after moving HUD toasts below an open clock card (the proposal toast covered the vote card's title) |

## 2026-10-15/16 — v2.2 release gate (lead, the host, sandbox `lead`, capped remote.sh)

| Command | Result |
|---|---|
| `pnpm -r --no-bail run typecheck` (merged tree) | ✅ 7/7 |
| `pnpm -r --if-present run build` | ✅ |
| `pnpm test` (1st merged run) | ❌ 1 file: `playtest.refresh` EADDRINUSE 3384 — new `tests/security/hostile-client.test.ts` used the same fixed port → moved to 3391; both pass (18 + 4 expected-fail) |
| `pnpm test` (final tree) | 1037 passed, 34 expected-fail, 5 skipped; ❌ 2 local-only v2.3 audit files: `web-render` (port 3387 clash in the parallel run; ✅ 2/2 alone) and `ops-restore-drill` (fails in the merged tree; server boots and serves fine by hand — test-harness issue, owned by v2.3/ops; file is git-excluded) |
| `tests/perf/server-profile.ts --snap2 no/yes` | 13 986 → 1 487 B/s per client (docs/perf-v2.2-results.md) |
| `tests/perf/client-perf.ts` runtime / load / no-GPU | table in docs/perf-v2.2-results.md |
| `node scripts/perf/budgets.mjs …` | ✅ 13/13 (`tests/perf/results/2026-10-15-v2.2.json`) |
| e2e gate run 1 (22:3x, merged snapshot) | lobby ✅ v21-clock ✅ v2-social ✅ v2-phone ✅ v2-look ✅ v2-st-ui ✅ ux-ready ✅ game-chaos ✅; game-full ❌ (helper walked into its own doorway → interiors are walkable now; helpers fixed by world-art, `GAME_RUN=v22fix5` ✅ 7.8 m); ux-walkthrough ❌ (waiting room visible after 10 s on the loaded host → 60 s timeouts) |
| e2e gate run 2 (23:5x–00:33, final tree) | lobby ✅ v21-clock ✅ v2-social ✅ v2-phone ✅ v2-look ✅ ux-ready ✅ game-full ✅ game-chaos ✅ ux-walkthrough ✅ (8.1 m); v2-st-ui ❌ race ("Next visit" re-rendered between count() and click) → spec made race-tolerant → ✅ (1.2 m) |
| prod hotfix `scripts/deploy-hshi-u1.sh prod 8fbad32` (own avatar missing after fast reload) | ✅ healthy, verified by the user in a live lobby |

Agents' own runs (feature work, all via `scripts/remote.sh`): see their sections in docs/perf-v2.2-results.md
and the v2.2 release notes; each feature agent ran typecheck + its unit tests + a browser check under the lock.

## 2026-10-16 — v2.3 release gate (lead, hshi-u1, sandbox `lead`, capped remote.sh, quiet host)

| Command | Result |
|---|---|
| `pnpm -r run typecheck` | ✅ 7/7 |
| `pnpm -r --if-present run build` | ✅ |
| `pnpm test` | 110/111 files ✅; ❌ `tests/integration/harness.test.ts` asserted the old random-port range → random test ports moved to 3400-3449 (`tests/support/server.ts`; no file hardcodes ports there) and the assertion uses the shared constants → ✅ 6/6 |
| e2e (16 suites): lobby, v21-clock, v2-phone, v2-look, v2-st-ui, ux-ready, chat-bubbles, door-boards, door-reconnect, doors, hd-cast, v23-chat, v23-settings, ops-moderation, ops-admin-settings, game-chaos (`GAME_RUN=v23b`) | ✅ all |
| e2e v2-social | ❌ (1) a Trusted Types console violation from msgpackr's `new Function('')` probe → removed at build time (vite plugin `ct-msgpackr-no-eval`, the library's documented no-eval replacement); (2) pie-menu tap timing (seen once before) → re-run ✅ both tests |
| e2e game-full (`GAME_RUN=v23a`) | ❌ ST "Grimoire" tab click timed out (random deal took the visit-from-Grimoire path; artifacts overwritten) → re-run `GAME_RUN=v23c` ✅ 8.1 m; not reproduced, noted as a possible flake |
| e2e ux-walkthrough | ❌ "joystick pushed down moves the player down": the phone player's cottage was on the bottom map edge (random deal) → the check now tries down / left / right and requires movement in an open direction → ✅ 7.2 m |
| `pnpm exec tsc -p tests/tsconfig.json --noEmit` | ✅ |

Feature/security agents' own runs are listed in their reports (private audit notes) and summarised in docs/security-v2.3.md.

## 2026-10-18 — v3 C1 gate (`v3-integrate`, acting as lead + qa-deploy; hshi-u1, `flock -s v3-heavy.lock`)

Gate runs (`CT_AGENT=v3-integrate scripts/remote.sh …`):

| Command | Result |
|---|---|
| `pnpm -r run typecheck` | ✅ 7/7 |
| `pnpm build` | ✅ exit 0 (`town3d` 1176 kB / 380 kB gzip, `TownGame` 1283 kB / 359 kB gzip) |
| `--no-sync pnpm test` (after the build) | ✅ 167 files / 1944 tests pass, 1 file / 5 tests skipped (132.7 s) |
| `--no-sync node scripts/perf/bundle-report.mjs --json …` + `node scripts/perf/budgets.mjs --bundle …` | ✅ all measured ok: entry JS 43.8/45, entry CSS 12.3/15, LobbyRoute 68.4/72, TownGame 281.2/300 KiB br, atlases 578.5/700 KiB (runtime keys SKIP: no perf inputs) |

C1 continuation (integrator, same day; host GPU, `E2E_V3=1 E2E_PORT=3450 CT_GL=gpu`, both locks, one spec file at a time):

| Command | Result |
|---|---|
| `pnpm -r run typecheck` | ✅ 7 projects |
| e2e `--project=v3` `v3-doors` (webServer build) | ✅ 1/1 (40.6 s) |
| e2e `v3-social`, `v3-boot`, `v3-vote`, `v3-mixed`, `v3-life` (`CT_E2E_NO_BUILD=1`) | ✅ each 1/1 |
| e2e `v3-lobby-choice` | ❌ 3/3 — by design: the WP8 WIP removed the Town radiogroup and the `/` join preview; superseded by `v3-paths` (delete with WP8) |
| e2e `v3-fallback` (1st) | ❌ 3/4 — "chunk fails" (1 request, expected ≥ 2): the fresh-URL retry can never work (sub-chunks import `town3d-*.js` by plain URL) → retry dropped in `GameScreen.tsx`, spec now asserts one request + Classic in place |
| client typecheck + `tsc -p tests/tsconfig.json --noEmit` | ✅ |
| e2e `v3-fallback` (rebuilt dist) | ❌ 3/4 — "WebGL context loss": first loss went to Classic (three `getProgramInfoLog()` null → `.trim()` between `loseContext()` and the event; read from trace.zip) → `TownGame3d.ts` counts a throw on a lost context as that Engine's one loss |
| client typecheck (after the fix) | ✅ |
| e2e `v3-fallback` (rebuilt dist) | ✅ 4/4 (35.9 s) |
| e2e `v3-fallback -g 'context loss' --repeat-each=3` | ✅ 3/3 |
| final dist, one file at a time: `v3-doors`, `v3-social`, `v3-boot`, `v3-vote`, `v3-mixed`, `v3-life` | ✅ 21.6 s / 8.5 s / 10.5 s / 23.6 s / 11.3 s / 1.1 m |
| Classic e2e `--project=chromium doors.spec.ts chat-bubbles.spec.ts` (`E2E_PORT=3451`) | ✅ 2/2 |
| `pnpm vitest run apps/client/test/game3d` | ✅ 28 files / 389 tests |

C1 review fix round (same day):

| Command | Result |
|---|---|
| `pnpm vitest run …voteCam.test.ts …paths.v2.test.ts …voice.test.ts …voice.audit.test.ts …world.stage.test.ts` | ✅ 5 files / 55 tests (voteCam 12 incl. the new failed-build test) |
| `--no-sync pnpm -r run typecheck` | ✅ 7/7 |
| `--no-sync pnpm vitest run tests/security/voice-cost.test.ts` | ✅ 35/35 |

Not run in C1: `v3-paths` (WP8), `hd-cast` v3 branch, harness stills, an e2e for the room-build camera fix (unit test
only), runtime perf budgets.
