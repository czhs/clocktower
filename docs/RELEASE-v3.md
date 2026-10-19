# Clocktower Town v3.4

Status: **see docs/progress.md "v3 handoff" and docs/test-results.md "v3.4 deploy"** (tag `v3.4` on `v3-game`). Gate:
docs/test-results.md "v3.4 release gate". Contract and decision log: docs/v3/INTEGRATION.md §11 "v3.4". Design and the
earlier numbers: docs/perf-v3/sprites.md (branch `v33-sprites-ship`, merged here).

v3.4 draws the characters as **baked sprites at the `low` tier** — the tier every integrated-GPU laptop stays at since
v3.3. `high` (desktop / laptop dGPUs) and `cpu` (software GL) keep the live rigs. Each character is one camera-facing
quad that samples a G-buffer sheet baked at runtime from the character's own rig and is lit per texel by the vendor's
own character shader (day / night ramps, light pool, ghosts, talking rim, outlines, depth-correct occlusion).

## Faster
- **Real laptop, v3.3 → v3.4** (Intel Arc iGPU, Mesa, Chrome 143 headless ANGLE GL-EGL, 1440×900 DPR 2, `auto` (= `low`,
  promotion declined on every load in both builds), 14 bots + the Storyteller, 17-18 avatars incl. townsfolk; the same
  harness, v3.3 = tag `v3.3` 72aba16; v3.3 measured once in a fresh browser and once with warm Chrome caches, v3.4 in
  fresh browsers):

  | | v3.3 (rigs) | v3.4 (sprites) |
  |---|---|---|
  | waiting room, 14 walking: fps / GPU ms p50 (p95) | 59.6-59.9 / 8.1-8.9 (8.9-9.9) | **60 / 4.7 (4.8-5.7)** |
  | day walk on the square | 59.5-59.6 / 8.2-8.9 | **60 / 4.7** |
  | day, 6 ghosts walking | 59.9-60 / 8.4-9.0 | **60 / 7.0-7.4** |
  | the vote (window from the nomination: camera switch + sheet re-bake) | 59.5-59.8 / 9.1-9.5, worst frame 33-50 ms | 59.4 / 7.0, **worst frame 67 ms** (one frame, no long task; the first builds of this release measured 83-117 ms) |
  | night, own cottage (30 fps idle cap) GPU ms | 1.8-2.2 | 1.2-1.3 |
  | main-thread JS per frame p50 | 2.9-3.8 ms | 2.5-3.5 ms |
  | triangles per frame, square | 0.48-0.66 M | 0.17-0.35 M |
  | **first join** (fresh browser profile: cold HTTP / shader / IndexedDB caches) ready → every avatar drawn | 13.3 s → 15.4 s | **13.3-13.4 s → 14.6-15.3 s** (rigs first; every avatar a sprite at 23.7-24.7 s, in the background) |
  | **repeat join** (reload) ready → every avatar drawn | 2.5-2.9 s → 3.0-3.4 s | 2.6-2.9 s → 3.2-3.5 s (sprites from the IndexedDB cache at 7.3-8.1 s) |
  | JS heap after GC | 179-189 MiB | 182-200 MiB on repeat joins before the kit warm-up, 242-302 MiB with the bake kits (kept for re-bakes) |
  | NVIDIA RTX 4070 laptop dGPU, `auto` | `high` (rigs), 60 fps, GPU 4.0-4.2 ms | **unchanged**: `high` (rigs, the sprite chunk is not even loaded), 60 fps, GPU 4.0-4.3 ms |

  Bench (laptop iGPU, the real engine + Hollowmere + avatar layer on a scripted state, 15 characters, 1280×720, GPU-
  inclusive frame time, uncapped): walking 13.8 → 7.5 ms, idle 13.3 → 7.5 ms, night (light pool) 15.5 → 8.5 ms, night +
  ghosts 12.2 → 8.2 ms; triangles 744 k → 349 k; avatar update 0.45-0.65 → 0.08-0.14 ms.
- **GPU memory of the characters: ~33 MiB for 17 avatars at the follow camera** (planes 32 MiB + shadow proxies 1 MiB;
  rig geometry for 15 rigs at `low`: 35 MiB; the v33-sprites-ship branch kept ~150 MB). Trimmed in v3.4: the finished
  sheets are copied into render targets **without a depth buffer** (halves each atlas), the bake rigs' **geometry buffers
  are freed after each bake** and re-uploaded one attribute per bake unit when needed, and **only the current camera
  key's sheet is kept** (a switch back loads the stored sheet from IndexedDB). Peak while the vote re-bakes: ~50 MiB
  (old + new sheets) for a few seconds.
- **The first join is not slower than with rigs**: every avatar is built as a rig first (exactly as v3.3); the sheets bake
  in the background (4 ms of work per frame) once the tier is settled (no `low` → `high` promotion pending: `high` would
  draw rigs, and the GPU probe must time rigs), and each character swaps to its sprite once its sheet and the sprite's
  shader programs are ready. A repeat join swaps from the IndexedDB cache (no bake).
- **The sprite code is a separate lazy chunk** (18.5 KiB br), downloaded only when sprites are on; the town3d chunk grows
  290.0 → 293.3 / 300 KiB br.

## Known issues (v3.4)
- Everything in "Known issues (v3.3)" below still applies (the Intel first-visit shader compile: v3.5).
- **Look differences** vs the rigs (docs/perf-v3/sprites.md §3; stills `tests/v3/shots/v3.4/`, 0.14 % (day), 0.14 %
  (vote), 0.38 % (night ghosts) of the frame differ, host GPU): no secondary motion (acceleration lean, head / chest lag,
  scarf / tail swing, planted feet while gliding; turns / starts land on other walk frames); feet on steps sink toward
  the lower foot instead of per-foot IK; shadows from a 2-6 cm clustered proxy (edges differ by a texel); fur / feather
  terminator hints missing; **no characters in water reflections at `low`**; after a camera change (vote camera, a
  resize, a room) **the previous sheet shows until the re-bake lands** (≈ 1-4 s on the laptop, sliced).
- **Background bake hitches after a first visit**: while the sheets bake (≈ 10 s after the tier decision on the laptop)
  the vendor's synchronous rig build per character (up to 75-215 ms) and the sheet programs' compiles cost 5-10 long
  tasks (max 160-245 ms). Repeat visits load the sheets from IndexedDB (no rig build for the sheets; the kits are then
  built one per 1.5 s in the background so the first vote re-bake only renders cells).
- **The vote camera's re-bake** (once per new camera key and session; stored afterwards) still costs one or two long
  frames on the laptop (67 ms, one frame, on the laptop with the kits warm; 83-117 ms when the vote came before the kit warm-up; rigs: 33-50 ms); the cache store waits until the vote closes.
- A spec whose own vertex shader computes more than 3 custom varyings would need a wider encoding (none today).

# Clocktower Town v3.3

Status: **on prod since 2026-10-18 18:26 PDT** (https://clocktower.chrisshi.com, tag `v3.3` = `72aba16` on `v3-game`). Gate and deploy: docs/test-results.md "v3.3 release gate" /
"v3.3 deploy". Contract and decision log: docs/v3/INTEGRATION.md §11 "v3.3". Numbers: docs/perf-v3/{laptop,gpu,bake}.md.

v3.3 is a perf release for laptops with integrated GPUs, measured on a real one (Intel Arc iGPU, Mesa, Chrome 143;
docs/perf-v3/laptop.md): the town no longer promotes itself to the expensive `high` tier on a GPU that cannot afford
it, the v3.1 static merge is off (it cost integrated GPUs time), and a repeat join replays the trees from a local cache.

## Faster
- **"Auto" stays at `low` on an integrated GPU.** Until v3.2 every `auto` town that started at `low` rebuilt itself at
  `high` after ~2.4 s whenever the median frame was under 45 ms, i.e. always at a 60 fps cap. On the laptop's Intel
  Arc iGPU that meant a second full town build after the join and a GPU-bound `high` tier: **52-55 fps in the vote**
  (p95 33 ms), GPU 13-14.5 ms per frame. Now the promotion needs measured headroom (`game3d/promote.ts`): after the
  first clean sample at `low`, 90 outdoor frames are timed on the GPU (`EXT_disjoint_timer_query_webgl2` around the
  render, `vendor/gpuTimer.ts`); only a median of ≤ 6 ms (≤ 4.5 ms for a renderer string naming an integrated GPU:
  Intel, AMD "Radeon Graphics" APUs, mobile GPUs) and ≤ 8 ms of main thread promotes. Without a GPU timer an integrated
  GPU is never promoted and any other GPU needs ≤ 8.5 ms frames in an uncapped window (visible only on ≥ 120 Hz
  panels). Interiors (2-4 ms even on the iGPU) never count. AMD APUs now also start at `low`. A desktop / laptop dGPU
  still starts at `high` directly (no probe, no rebuild). The decision is logged once (`[town3d] promotion …`) and in
  `__ctCamera.camera3d().promotion`.
- **Real laptop, before / after** (Intel Arc iGPU, Mesa, Chrome 143 ANGLE GL-EGL, 1440×900 DPR 2, `auto`, 14 bots,
  v3.2 `ceab1ce` vs v3.3 in the same harness; docs/perf-v3/laptop.md §8):

  | | v3.2 | v3.3 |
  |---|---|---|
  | tier chosen | `low` → **`high` 2.2-4.8 s after the first frame** (a second town build) | **`low`, stays** (promotion declined: GPU 8.0-10.2 ms, integrated) |
  | waiting room, 14 walking: fps / GPU ms p50 | 53.7 / 14.5 (p95 frame 33 ms) | **59.6 / 7.9** |
  | day walk on the square | 58.1 / 12.2 | **59.5 / 8.8** |
  | **the vote** | **50.4** / 15.1 (p95 frame 33 ms) | **59.7** / 9.7 (p95 16.7 ms) |
  | waiting room idle (30 fps idle cap both) GPU ms | 16.1 (high) | 10.4 |
  | warm reload, ready ms (3 runs) | 3 532-3 770 | **2 633-2 690** |
  | repeat join (home → lobby page load, 2 runs) | 3 403-3 416 | **2 426-2 455** (279 tree-cache hits, town build 2.5 → 1.2-1.4 s) |
  | repeat join in the app (Leave → lobby link) | 4 886-4 902 | 3 969-4 286 |
  | NVIDIA RTX 4070 laptop dGPU, `auto` | `high` from the first frame, vote 60 fps, GPU 4.35 ms | **`high`** from the first frame (no probe), vote 60 fps, GPU 4.38 ms |

  At explicit `low` the merge-off frame is ≈ 1 ms cheaper on the iGPU GPU (vote 10.8 → 9.4 ms) for +96 draws.
- **The v3.1 static merge is off by default** (`ct.debug.v3merge=1` turns it on). The real-laptop A/B showed it costs
  the iGPU GPU time (+0.2-0.4 ms at `low`, +0.8-2.6 ms at `high`, −2-2.5 fps at `high`) and the desktop gains nothing.
  The merge code keeps the v33-gpu fixes (`world/merge.ts`): three r170 re-resolved a `BatchedMesh`'s program on every
  draw (`colorTexture` vs `_colorsTexture`) and the batches flipped programs with the plain kit meshes; with both
  workarounds the merge is CPU-neutral (it was +7-12 % render JS), so it can be re-tried if a vendor change makes it a
  GPU win.
- **River reflection only when it changes** (v33-gpu, `vendor/gpuLevers.ts`, default on): with a still camera the
  river's reflection re-renders only when a figure that can appear in it moved, the light changed, or at 10 Hz for
  the ambient motion (was 30 Hz always): −50-70 % reflection renders while the camera rests, pixel-identical.
  **Off-screen water passes are skipped** (fountain / bowl / well post passes whose shape is outside the frame).
- **Repeat joins replay the trees** (v33-bake, IndexedDB `ct-town-bake`, default on, `ct.debug.v3bake=0` = off): the
  town's `createTree` output (46 % of the town build) is recorded on the first join and replayed byte-identically on
  the next one with the same tier and window height (leaf density follows the low-res height). Measured on the branch:
  repeat join −0.8 s desktop, −3.3 s at CPU ×4, **−0.95 s on the laptop (3.6-3.8 → 2.74 s)**; on the release build the laptop's repeat join went 3.4 → 2.43 s (279 / 279 hits); a resize to four other window heights missed once each, stored, then hit, and never kept more than 2 records. At most 2
  records (~15-22 MB each) per vendor build are kept, least recently used dropped; a vendor refresh invalidates every
  record; private mode / a full quota / a hung IndexedDB (2 s) just build live.

## Known issues (v3.3)
- Everything in "Known issues (v3.2)" below still applies.
- A first visit on an Intel / Mesa laptop still freezes ~9 s on the loading sheet compiling the town's shader programs
  (≈ 14 s to the first frame; warm visits 3.4-4.7 s). Next: fewer program variants, parallel compile.
- When a GPU does qualify for promotion, the switch to `high` is still a full town rebuild behind "Rebuilding town…"
  (≈ 1-2.5 s on the measured machines; at a safe moment, never during a vote), now ~1.5 s later than before (the probe).
- The tree cache misses once per new window height (resize → new record on the next join).
- Characters as baked sprites (`v33-sprites-ship`), the cached static layer (`v33-tiles`) and the split shadows / deferred
  light pool (`v33-light`) are not in this release.

# Clocktower Town v3.2

Status: **on prod since 2026-10-18 16:32 PDT** (https://clocktower.chrisshi.com, tag `v3.2` = `ceab1ce` on
`v3-game`). Gate and deploy: docs/test-results.md "v3.2 release gate" / "v3.2 deploy". Contract and decision log: docs/v3/INTEGRATION.md §11. Numbers: docs/perf-v3/fullstack.md §10.

v3.2 is a perf release on top of v3.1 (branch `v32-early` merged): the town draws at half rate while nothing on screen
changes, a v3 join no longer downloads Phaser, the 3D town is prefetched on the home page, and the origin ships
build-time brotli.

## Faster
- **Idle rendering: 30 fps while nothing on screen changes.** The frame loop drops to 30 fps when for 3 s nobody moved
  or talked, the camera stood still, the hour did not ease, no vote / nomination was open and there was no input or
  state change (`game3d/idle.ts`, `perf.ts ActivityWatch`); any change draws at the full rate on the very next vsync.
  Ambient motion (wind, water, fireflies, breathing) steps at 30 Hz meanwhile. Measured at CPU ×4, 1440×900 DPR 2,
  15 players: main-thread work **−42 %** in a still waiting room (561 → 328 ms/s), **−44 %** on a still day square
  (569 → 317), **−41 %** at night alone in a house (102 → 61); walking and the vote unchanged at 60 fps; GPU work
  halves with the frame count. It composes with the other caps: the cpu tier's 30 fps and `V3_MAX_FPS` 60 are never
  raised, and `ct.debug.fps` turns idle rendering off; `ct.debug.v3idle=0` is the A/B switch. A vote is never idle.
- **A v3 join never downloads Phaser** (−360 KB br and −55 ms of evaluation per join, −200 ms at CPU ×4). Only the
  renderer select.ts will pick is fetched (`ui/common/townPrefetch.ts`); Classic (Graphics = Classic, phones, the boot
  guard, the auto-fallback memo, no WebGL2, a v2 lobby) still loads it, and an in-place fallback imports it on demand.
  `town3d` now starts with the join ticket instead of after `lobby:view`.
- **The 3D town is prefetched on the home page.** The v3 landing and home screens fetch LobbyRoute + `town3d` when the
  browser is idle (not with Save-Data or a 2g / 3g connection, not where Classic would be used); a join from the home
  page then takes `town3d` from the cache.
- **Build-time brotli.** `pnpm build` writes `.br` (q11) and `.gz` siblings for every text asset
  (`apps/client/build/precompress.mjs`); the server sends them to clients that accept them, with the same immutable
  Cache-Control, `Vary: Accept-Encoding` and per-variant ETags (`apps/server/src/precompressed.ts`). `town3d` on the
  wire: **336.6 KB (Cloudflare's q4) → 290.4 KB** (283.6 KiB; measured through Cloudflare after the prod deploy: the
  edge passes the origin's br through and caches it; the chunk grew by the v3.1 merge since the 279.6 KB measured on
  `v32-early`).
- Bundles: entry JS 44.2/45 KiB br (the home prefetch module is imported lazily so select.ts stays out of the entry),
  LobbyRoute 66.9/72, TownGame 281.4/300, `town3d` 283.6/300. New budget keys: `v3JoinPhaserChunk` = 0 (no Phaser chunk
  in the static import closure of LobbyRoute + `town3d`) and `town3dShippedBrKiB` ≤ 300 (the shipped `.br` sibling;
  a build without it fails the key).

## Known issues (v3.2)
- Everything in "Known issues (v3.1)" below still applies.
- The 30 fps idle window shows ambient motion at half rate; a change that no idle rule catches is drawn at most 33 ms
  late (never stale).
- An old v2 share link opened at a v3 path (`/lobby/x`) starts `town3d` before `lobby:view` moves the page to `/v2/`
  (rare; that page then loads Phaser too).
- Cloudflare: the hashed JSON atlases are still `DYNAMIC` (not cached) at the edge until the owner adds the `/assets/*`
  cache rule; Smart Tiered Cache is also an owner step (fullstack.md §10.3).

# Clocktower Town v3.1

Status: **tagged `v3.1` on `v3-game` (`b7803fa`), on prod from 2026-10-18 16:04 PDT until v3.2 replaced it.**
Gate and commands: docs/test-results.md "v3.1 release gate". Contract and decision log: docs/v3/INTEGRATION.md §11.

v3.1 is a fix and perf release on top of v3.0: three v3.0 known issues fixed, a draw-call cut for the town, the C2 QA
round's vote-camera finding fixed, and the cpu tier profiled to its real cost.

## Fixed
- **No more `TypeError … 'isReady'` page error** (v3.0 known issue). The avatar pre-warm no longer uses three's
  `compileAsync`, whose uncancellable poll timer could read a disposed program after a rebuild, a leave or a cast
  change. `avatars/precompile.ts` compiles, then polls on its own and stops when the body is dropped, the layer is
  destroyed or the 3 s pre-warm deadline passes. New e2e `v3-pageerrors` (8 bots join and leave at the high tier, a GL
  context loss forced while an avatar compiles): it failed with the TypeError on v3.0 and passes on v3.1 (0 page errors).
- **Remount memory leak.** One destroyed town (~80-95 MB of JS heap) stayed alive for good: the vendor life module's
  `stats.at` getter closure held the whole build scope, and V8 kept that closure through the `stats` literal's shared
  layout. A build-time patch (`apps/client/build/pixel3dImports.ts`, fails the build on vendor drift) moves the getter to
  module level. Harness `?mode=cycles` (5 mounts, 2 rebuilds, an injected crash), SwiftShader: heap **15.4 → 97.1 MB
  (FAIL) before, 15.4 → 20.3 MB (+4.7 MB, PASS) after**; on the host GPU growth 95 MB → 6.6 MB, 0 engines retained.
- **DOM churn at bedtime and while walking** (v3.0 known issue). The countdown renders one m:ss string per shown
  second, the clock chip ticks once a second, and culled labels / house names are parked off-canvas with one transform
  write instead of visibility flips. 15 players, 1440×900, high: bedtime DOM UI writes **25.9 → 9.1 /s**, non-transform
  writes **35.3 → 9.3 /s**; walk non-transform writes **11.7 → 2.4 /s**.
- **The vote camera clears the real HUD** (C2 QA, HIGH). The voting-circle frame used to dodge fixed corner sizes only,
  so the Storyteller panel (a third of a laptop screen), the open chat, the vote and voice cards and the "Your home" chip
  covered seats, the nominee and the Storyteller. It now measures the HUD that is actually over the canvas on vote
  entry and on resize (`world/hudKeep.ts`), keeps the circle's paving edge inside the canvas and may zoom out further
  to fit (up to 2.4× the content size).
- **No house-name pills in the vote view** (C2 QA). Foreground houses' name pills projected into the circle, over the
  player labels, repeating a seated player's name.
- **A softer talking outline** (C2 QA art check). The speaking avatar no longer washes out: billboard lift 0.3 → 0.12,
  rig base lift 0.15 → 0.06, rim band 0.85 → 0.44 and thinner.

## Faster
- **Fewer draw calls for the town.** The static town-kit meshes of all buildings, props, ground and foliage are merged
  into 7 `BatchedMesh`es (one per kit material and shadow flag) at build time, culled once per frame; animated pieces
  leave the batch on their first change. Same-frame harness A/B at 960×540: square by day **272 → 201** draws (low),
  **343 → 264** (high); vote **395 → 295** (low), **459 → 348** (high); at most 8 low-res texels per still differ. In the
  live frame (14 remotes walking, 1920×1080): high **351 → 293** draws (−17 %), shadow 84.6 → 66.9; low 240 → 195 (−19 %).
  Cost: main-thread render JS **+0.3 to +0.7 ms per frame** on the host. Switch: `ct.debug.v3merge=0` turns it off.
- **cpu tier: profiled, not faster.** Still about 190 ms per synced frame / 7.6-7.8 fps on SwiftShader (960×540, 14
  remotes). The cost is not the toon shading but the vendor cut-away code on every town material (SwiftShader runs
  every branch); see docs/perf-v3/cpu.md §7. The only default change is a pixel-identical program rewrite (the ground's
  unused intro-flight branches compiled out); the material twins are opt-in (`ct.debug.cpuShade`).
- Bundles: `town3d` 270.4 → 282.7 KiB br (merge + precompile + hudKeep); new budget key `town3dChunkBrKiB` ≤ 300.
  Entry JS 44.1/45, entry CSS 12.3/15, LobbyRoute 68.5/72, TownGame 281.4/300 KiB br.

## Known issues (v3.1)
- **cpu tier misses its goal** (7.6-7.8 fps against ≥ 20). Next lever: a cheap cut-away at the cpu tier (CONTRACT-REQUEST
  in INTEGRATION.md §9.2), then character LOD.
- **The town batch costs main-thread time** (+0.3-0.7 ms per frame on the host). It still needs an A/B on a laptop iGPU
  at 1440×900 DPR 2; if the main thread loses there, it will default off.
- C2 QA findings not fixed yet (docs/progress.md "v3 handoff"): a black disc over the market stall at bedtime; the own
  avatar hidden behind the banister in Stargazer's Tower (house-0); the porch gable half-faded over the avatar after
  leaving house 5; the block marker is weak without the pennant; a navy slab outside the clock tower room; no "rejoin
  your game" in the finder; the clock chip still counts "Nominations close" after an execution.
- The `v3-pageerrors` context-loss step never fires on the host GPU (no KHR_parallel_shader_compile); the
  disposed-during-compile case is covered by unit tests only.
- Phones: not supported in v3 (a note says so); use `/v2/`.

# Clocktower Town v3.0

Status: **on prod since 2026-10-18 13:45 PDT** (https://clocktower.chrisshi.com, `4be9bb4`), and on the dev service
until v3.1 replaced it there. Gate and commands:
docs/test-results.md "v3.0 release gate". Contract and decision log: docs/v3/INTEGRATION.md.

v3 moves the game into the pixel3d three.js town, Hollowmere. The rules, the Storyteller tools, voice and
the secrecy model are the same as v2.

## The town
- **Hollowmere, the pixel3d three.js town, is the real game at `/`.** Every lobby created at `/` is a
  Hollowmere lobby, drawn in 3D with pixel-art post-processing: 15 cottages, the square with
  the voting circle, and the clock tower. Players walk; nobody is moved automatically.
- **v2 "Classic" lives at `/v2/`.** The world comes from the URL path. Lobbies made at `/v2/` are the
  v2 town, unchanged, and a share link opens the right app. There is no town picker any more.
- **A v3 loading screen:** the Hollowmere title card with walking characters and a progress bar.
  It covers boot, joining and the town build. `/v2/` keeps the old "Lighting the lamps…" lines.
- **The voting circle without candles:** the per-seat candle stakes, flames, wisps, halos and pennants
  are gone. The vote has its own camera framing (±45° yaw, 23° pitch). The clock hand points at the
  current voter's stone, and a lamp lights for each yes vote.
- **The tower clock is the Storyteller's timer.** The clock tower dials show the day clock, and the HUD
  clock chip reads the same time.
- **The clock tower can be entered.** It is a 16th building with its own room, and it is never shown
  as "Nobody lives here".
- Everything from v2 carries over to the 3D town: avatars with ghosts, lanterns and talking outlines;
  name labels, DOM chat bubbles, pins, pointing, the pie menu, door boards, house names and seat
  markers.
- **If the 3D town fails** (no WebGL, a lost GPU context that cannot be rebuilt, a chunk that cannot
  load), the same lobby falls back in place to the Classic 2D renderer.

## Devices
- **Laptops first.** Integrated GPUs, DPR-2 screens and 120-165 Hz panels are the target.
- **Phones are not supported yet.** A note says so on the loading screen and the `/` finder (coarse
  pointer and a short side under 600 px). `/v2/` still works on phones.
- **No GPU:** a `cpu` quality tier is picked automatically on software GL (SwiftShader, llvmpipe).
  It is playable but not smooth yet (see Known issues).

## Faster (v3 perf swarm, numbers from docs/perf-v3/*.md)
- **60 fps render cap** on high-refresh displays (`perf.ts` `V3_MAX_FPS`, a phase-locked frame gate).
  A 120-165 Hz panel no longer renders 2-3x the frames: unthrottled high went from 640 to 60 rendered
  fps. At ≤ 78 Hz nothing changes. (learnings.md §3.1)
- **`cpu` tier** for software GL: a 320×180 internal target, a 30 fps cap, no shadows, no normal pass,
  and unlit materials. On SwiftShader at 960×540 with 14 remotes, `low` measured 1199 ms per synced
  frame, 3.1 fps and 466 ms input → motion; `cpu` measures **194 ms, 7.6 fps and 109 ms** (6.2x cheaper).
  The step-down chain is high → low → cpu → Classic. (cpu.md)
- **Low tier shadow cadence:** the shadow map is redrawn every 2nd frame, and at once on a camera cut.
  Draw calls went from 244.6 to 221.4 per frame, shadow calls from 46.5 to 23.3 and triangles from 351k
  to 302k. Also, a per-frame regex over all 16 buildings is gone. (stage.md §3)
- **Smaller download:** the `town3d` chunk went from 309.5 to 270.4 KiB br. The roster is inlined
  trimmed and the room modules load lazily. Every town piece, the room chunk and the warm-up room are
  fetched in parallel instead of in 20 serial round trips. Collision checks allocate nothing. The v3 UI
  atlases are WebP: 442.5 → 149.3 KiB. (commit "v3 perf(client)", net.md)
- **Server and network:** in a 15-bot v3 lobby, the Storyteller's `game:view` during a day walk went
  from 38-48 to 9 KB/s (−78 %). S2C per client dropped from 3956-4542 to about 2230 B/s. Escort
  planning is 65-70 % cheaper, the longest door route `findPath` went from 1612 to about 270 µs, and
  snapshot fan-out p50 went from 131 to 90 µs. LiveKit calls per lobby went from 440 to 31.8 a minute.
  WebSocket permessage-deflate is opt-in (`WS_DEFLATE=on`; off by default because it costs about 45 %
  more server CPU). (server.md, net.md)
- **DOM UI:** measured at about 0.3 % of the main thread in a 15-player game. Two small fixes landed:
  no layout read in a timer, and no whole-document restyle from unchanged CSS variables. (ui.md)
- The shipped bundle budgets still hold: entry JS 43.9/45, entry CSS 12.3/15, LobbyRoute 68.3/72,
  and TownGame 281.1/300 KiB br.

## Known issues
- **The `cpu` tier misses its goal:** 7.6 fps against a target of ≥ 20 fps. The main remaining cost is
  the vendor toon shader (cpu.md §4).
- **Phones:** not supported in v3, only a note. Use `/v2/` on a phone.
- **`v3-doors` e2e is flaky:** in WP8 the keyboard walker stuck once on the way to house 5 and passed
  on the rerun. The cause is not found yet.
- **Bedtime countdown churn:** about 26 DOM writes/s, from two countdowns re-rendering 4 times a
  second (ui.md). It is cheap, but the fix is planned.
- **The block pennant was removed** along with the candle stakes. The nominee/execution pulse on the
  stone, the short hand and the overlay still mark who is on the block.
- Classic UI-driven e2e specs that create lobbies from `/` need `CT_E2E_BASE_PATH=/v2`. Only `doors`
  and `chat-bubbles` were re-run for this release.
- **An uncaught `TypeError … 'isReady'`** can show in the console at the high tier: three.js `compileAsync`'s
  poll timer hits an avatar material that lost its program (avatars `prewarm`). The avatar still shows after
  the pre-warm timeout. It was seen twice in the dev smoke.
- Open review items: docs/v3/INTEGRATION.md §11 "C1 review fix round" (deferred low findings).
- **Not merged yet (v3.1):** the remaining work on the cpu, client and server perf branches, C2 QA (art
  checks and the full v3 e2e on GPU and SwiftShader), and the plan in docs/perf-v3/learnings.md.
