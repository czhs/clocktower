# v3.3 perf: build-time town bake (front "bake", branch v33-bake)

Agent `v33-bake`, 2026-10-18. Goal: stop paying the procedural town build (≈ 2 s desktop, ≈ 8 s at CPU ×4, two
2.4-3.4 s freezes) at every join, and evaluate view-dependent pruning of geometry no camera pose can see.

**Result in one line:** the town's single largest cost, `createTree` (46 % of the town build), is now replayable
bit-exactly from recorded output. Shipping that output as a static asset is **not worth it** (5 MB br per tier and
window height, for 0.9 s desktop). The **IndexedDB cache of the same data** (first join records, later joins replay)
takes a repeat join from **9.6 s to 6.3 s at CPU ×4** (desktop 2.66 → 1.85 s) with pixel-identical output. It ships
behind `ct.debug.v3bake=1`. View-dependent pruning is **not worth it**: the GPU already culls those triangles, and
dropping them would break the shadow pass and the cut-away section faces.

## 1. Where the build time goes (Node, the vendor headless, host CPU)

`scripts/v3/probe` (scratch, not committed) built every town piece against the exporter's stub engine with a V8 CPU
profile. Town build total 3.9 s on the host (≈ 2.1 s on the desktop, 8 s at ×4 in the browser):

| Inclusive ms (host Node) | What |
|---|---|
| **1 813** | `createTree` (src/world/trees.js), all callers: foliage templates 1 217, cottage leaf clumps (house-4 370, house-11 146, house-1 115) |
| 1 018 | of which `radius` → `fbm3` → `noise3` / `hash3`: the jagged-crown noise, per vertex / per sample |
| 753 | of which core blobs (Icosahedron detail 2 per lump + the crease test, again fbm3 per vertex) |
| 818 | ground (self 342: terrain bake loops, `poissonDisk2D` 219, `createGrass` 250, `polyDist` 125) |
| ≈ 400 | foliage after the trees (`composeTemplate`, `clusterGeometry`, chunk `merge`) |
| ≈ 300 | cottages' kit geometry (`tris`, `hexa`, `box`), props 63, dais 25, tower 25 |

`createTree` is a pure function of its options and the build camera's texel size (leaf spacing is in screen texels:
`clamp(texelWorld × leafTexels, 0.07, 0.3)`), so it is the one clean interception point that covers both the foliage
piece and the cottages. Note `texelWorld = 12 / lowH` and `lowH = ceil(window height / pixelScale)`: **the procedural
town already differs per window height** (leaf density). A bake keyed honestly must include it.

## 2. Design

| Part | File | What |
|---|---|---|
| Patch | `apps/client/build/townBake.ts`, entry in `build/pixel3dImports.ts` | `createTree` → asks `globalThis.__ctTreeBake.get(engine, opts)`; on a hit `__ctAssembleTree` builds the same `THREE.Group` (same cached materials, trunk / core meshes, leaf `InstancedBufferGeometry`, sorter, rim, `userData.tree`) from data; a miss runs the raw body and offers the result to `put` (with the unsorted leaf list). Inert without the global. |
| Drift | same | The assembly duplicates the tail of createTree, so the patch **pins sha256 of the vendor createTree source** (`CREATE_TREE_PIN`). A vendor re-publish that touches createTree **fails the build** (and the bake script) with "re-verify, then re-pin". The client cache key `__CT_VENDOR_HASH__` (vite define) hashes every file of `v3/pixel3d/src` + the patch + the format + three's version: any vendor refresh invalidates and purges every cached record. |
| Format | `apps/client/src/game3d/vendor/bakeFormat.ts` | `CTB1` + JSON header (vendor hash, per-key records) + 8-aligned typed arrays (geometry attributes / index generically; leaves: f64 base, f32 normal / variant / phase / sway / raised / radius / crease). Key = sorted-key JSON of the options minus `position` / `add` + texelWorld. |
| Bake script | `scripts/v3/bake-town.mjs` | Runs the vendor town (all pieces but life) headless in Node with the same patch, records every createTree, writes `town-bake.bin.gz` (`--out`), `--bench` (live vs replay), **`--verify`**: replays every key through the **client's** recorder + replay (`vendor/townBake.ts`) and compares with a fresh live createTree: geometry bytes, instance attributes, bounds, materials (same cached instance), names / flags, and the **re-sort at the vote camera's 45° yaw**. |
| Client cache | `apps/client/src/game3d/vendor/townBake.ts`, `vendor/town.ts`, `world/stage.ts` | With `ct.debug.v3bake=1`: `buildHollowmere` reads the IndexedDB record `vendorHash|tier|lowH` (a raw Blob), installs the hook for the build, records misses, and 4 s after the build stores the merged record (Blob of the parts: no big copy, no main-thread gzip). Never throws into the build. Numbers in `__ctCamera.stage().bake` (+ `townBuildMs`). |

Rejected or not reached:

- **Static bake asset** (`/assets`, immutable, precompressed): built and measured (§3). One (tier, lowH) is
  **21.9 MB raw, 6.0 MB gzip-9, 5.05 MB brotli-11** (the trees' raw core lumps: Icosahedron detail-2 blobs with four
  attributes, before the foliage piece decimates them), for 0.9 s desktop / 3.2 s at ×4. On Fast 4G (9 Mbit/s) the
  download alone is ≈ 4.5 s, and it only hits windows whose height maps to a baked lowH. Not worth shipping. A
  smaller bake would store the noise fields instead of geometry (≈ 0.7 KB per lump instead of 38 KB) but must then
  re-implement makeBlob / makeCone / the crease test outside the vendor: a vendor CONTRACT-REQUEST is the right place
  (a `buildGeometry` / template-data hook in trees.js, already asked in fullstack.md §8 item 1).
- **Web Worker generation:** blocked by our CSP (`require-trusted-types-for 'script'` + `trusted-types 'none'`: a
  `new Worker(url)` needs a TrustedScriptURL policy) and createTree is called synchronously from the pieces. With a
  baked call list (≈ 50 KB) workers could pre-generate in parallel, but that needs a Trusted Types policy change: not
  done.
- **Whole-piece output bake** (all final meshes): measured 7.8 MB gzip (foliage 3.7 MB, ground 1.6 MB) and would need
  every piece api / updater / material re-attached: rejected.

## 3. Numbers (desktop Chromium, discrete GPU, ANGLE/Vulkan, 1280×720 → tier high, lowH 360, local dist server)

Each row = one browser profile, three joins of a v3 lobby (visit 0 = cold IndexedDB, warm HTTP cache after visit 0).
`build` = the vendor `townBuildMs`; LT = long tasks before ready.

| | visit | ready ms | build ms | LT sum | largest LTs | heap at ready | cache |
|---|---|---|---|---|---|---|---|
| off ×1 | 0 / 1 / 2 | 2 997 / 2 664 / 2 655 | 2 092 / 2 096 / 2 107 | 2 302 / 2 034 / 2 055 | 865, 665 | 290 MiB | — |
| **on ×1** | 0 / 1 / 2 | 3 086 / **1 797 / 1 845** | 2 120 / **1 239 / 1 314** | 2 348 / **1 112 / 1 151** | 684, 282 | 290 MiB | 0 → 280 / 280 hits, read 29-33 ms |
| off ×4 | 0 / 1 / 2 | 9 721 / 9 650 / 9 560 | 7 971 / 8 163 / 8 129 | 8 658 / 8 548 / 8 578 | **3 428, 2 445** | 257-273 MiB | — |
| **on ×4** | 0 / 1 / 2 | 11 468\* / **6 285 / 6 209** | 8 077 / **4 562 / 4 549** | 10 319\* / **5 090 / 5 091** | **2 434, 1 054** | 273-290 MiB | 0 → 280 / 280 hits, read 99-133 ms |

Low tier (`ct.fxQuality=low`, what Intel iGPUs get), CPU ×4, two joins: off 8 123 / 7 865 ms ready, build 6 553 /
6 543, largest LTs 2 641 + 1 818; **on 8 086 / 5 078 ms, build 6 494 / 3 659**, largest LTs 1 820 + 816 (279 / 279
hits, read 130 ms, record 21.4 MB).

\* that visit-0 run overlapped a laptop session on the same server; the two earlier ×4 visit-0 runs with the flag on
were 9 747 / 9 715 ms (equal to off): recording costs 50-62 ms at ×4, 11-13 ms at ×1.

- Repeat join: **−0.8 s desktop (−31 %), −3.3 s at ×4 (−34 %)**; town build −41 % / −44 %. The 2.4 s freeze (the
  foliage piece) becomes 1.05 s; the largest remaining freeze is the ground piece task (≈ 2.4 s at ×4).
- First join: unchanged (+12 ms ×1 / +55 ms ×4 for recording). The store 4 s later: with CompressionStream gzip it was
  one **638 ms task at ×4** in the waiting room; storing the raw Blob removed it (after-ready long tasks equal to off).
- Storage: 21.9 MB per (tier, lowH) record in IndexedDB; records of another vendor build are deleted on write.
- Replay in Node (host): town build 3.30 → 1.53 s (high), 2.66 → 1.22 s (low tier, 279 hits).
- Steady frame, triangles, draw calls: **unchanged by construction** (the replayed groups are identical; the draw
  list does not change).
- Pixel diffs: not needed as stills: `bake-town.mjs --verify` proves every replayed tree **byte-identical** (attributes,
  index, bounds, instance order, materials, re-sort at yaw 45°) for both tiers at lowH 300 and 360 (374 keys, drift 0);
  the renderer sees the same buffers, so day / night / dusk / vote / cut-away / canopy-fade frames cannot differ.

Real laptop (Intel Arc iGPU, Chrome 143, ANGLE GL, no throttle): see §3.1.

### 3.1 Real laptop

LAPTOP_RESULTS

## 4. View-dependent pruning (measured, not implemented)

Counted on the built town (Node, all pieces, placements applied) over the camera poses the game uses (outdoor yaw 0
pitch 30°, vote yaw 0 / ±45° at pitch 23° / 30°; ortho camera, so facing depends on the pose only):

| static non-instanced triangles | count |
|---|---|
| all (houses, props, dais, tower, ground, foliage cores / trunks; leaves and grass are instanced sprites, excluded) | 461 583 (all FrontSide materials) |
| facing away from the outdoor pose | 168 613 (37 %) |
| facing away from **every** pose | 104 532 (23 %) |
| of those, on shadow-casting meshes | 99 637 (95 %) |

Why it is not worth it:

1. **The GPU already culls them** (FrontSide): pruning saves only their vertex shading, ≈ 0.3 M vertices per colour /
   normal pass, nothing on fill. The v3 frame is draw-issue bound on the CPU (fullstack.md §3: 80 % of the frame is
   three's draw issue), and pruning does not remove a single draw call.
2. **They are exactly the shadow casters:** three draws a FrontSide material's BACK faces into the shadow map
   (`shadowSide` defaults to the opposite side). Keeping them for shadows needs shadow-only copies = more draw calls,
   the opposite of the goal.
3. **The cut-away needs them:** the lifted cottages get BackSide section twins (`town.js`, roof-off) and the cut
   around the player shows interior-facing faces; the canopy fade reveals what is under crowns.
4. Ground under cottages: the terrain is one grid that receives shadows; its hidden cells cost vertex work only.

## 5. Risks

- The assembly duplicates createTree's tail: guarded by the source pin (build fails on any createTree change) and the
  `--verify` unit test (bit-exact, both tiers). A vendor change in a function createTree calls (makeBlob, crownLayout,
  materials) changes the vendor hash, so cached records are ignored; the replay itself does not re-implement them.
- Storage: ≈ 22 MB per tier and window height in the browser's IndexedDB (quota is per-origin, typically GBs; a full
  quota just fails the write, `stats.error`). A resized window misses once and adds a record (only the current vendor
  build's records are kept; no LRU across window heights yet).
- Heap: the decoded record (22 MB) lives during the build only; heap at ready unchanged within noise.
- Private / storage-blocked browsers: the read throws → live build (`stats.error`).

## 6. Recommendation

- **Ship the tree cache default-on after one more check** (repeat-join win −31 % desktop / −34 % ×4, pixel-identical,
  failure = today's path). Until then it stays behind `ct.debug.v3bake=1`. Before default-on: a real-laptop session
  with two windows sizes, and a cap on records per vendor build (e.g. keep the 3 newest lowH).
- **Do not ship the static bake asset** (5 MB br per window height for 0.9 s desktop).
- **Do not prune** view-hidden faces (no draw-call gain; breaks shadows / cut-away).
- The next big build costs are vendor-side: the ground piece (≈ 0.8 s desktop, the remaining 2.4 s freeze at ×4) and
  a compact tree-template data hook in trees.js (CONTRACT-REQUEST): either would make a small static bake feasible.

## 7. Commands run

| Command | Result |
|---|---|
| `CT_AGENT=v33-bake scripts/remote.sh node --cpu-prof … scripts/v3/probe/pieces.mjs high noon` (scratch) | piece timings + profile (§1), geometry sizes, pruning counts (§4) |
| `… node scripts/v3/bake-town.mjs --verify --lowH=360 --quality=high --tod=noon` | 280 keys, drift 0 |
| `… node scripts/v3/bake-town.mjs --verify --bench --lowH=300 --quality=high,low --tod=noon,night` | 374 keys (tod-independent), drift 0; Node build 3 334 → 1 584 ms (high), 2 530 → 1 338 ms (low) |
| `… node scripts/v3/bake-town.mjs --out /tmp/… --lowH=360 --quality=high` + brotli q11 | 21.9 MB raw / 6.0 MB gz / 5.05 MB br |
| `… pnpm --filter @ct/client run typecheck` | ok |
| `… pnpm vitest run apps/client/test/game3d` | 32 files, 424 tests passed (incl. townBake.test.ts) |
| `… flock -s …/v3-heavy.lock pnpm build` | ok |
| local Chromium (playwright-core 1.63) over `ssh -L 3475/3476` to a host dist server (`startServer({mode:'dist'})`, 8 v3 lobbies) | §3 |
| `… env E2E_V3=1 E2E_PORT=3477 CT_E2E_NO_BUILD=1 flock …/v3-heavy.lock flock …/browser.lock pnpm test:e2e --project=v3 v3-boot v3-doors v3-life` | 3 passed (1.6 min; flag off = the patched createTree on its inert path) |
