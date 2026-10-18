# v3.3 perf prototype: characters as baked sprites (front "sprites")

Agent `v33-sprites`, branch `v33-sprites` (from `origin/v3-game` `c67e1ea`), 2026-10-18. Prototype behind
`localStorage['ct.debug.v3sprites'] = '1'` (default off; a test build can force it with `VITE_V3SPRITES=1`).
Nothing changes with the switch off (e2e below). Code: `apps/client/src/game3d/avatars/sprites/**`,
`game3d/vendor/spriteLook.ts`, 12 lines in `avatars/layer.ts`; bench `tests/perf/v3-sprites{-page.ts,.mjs}`;
unit tests `apps/client/test/game3d/avatars.sprites.test.ts`.

## 1. Design

**What is baked is a G-buffer of the lighting inputs, not a lit colour.** Per cast spec, at runtime, ONE vendor rig is
built (as today), driven through its idle loop, one locomotion cycle at the game speed (150 px/s = 9.4 m/s: every cast
member is in its run gait) and the held `vote` pose, and every displayed drawing is rendered in the 8 facings through
the rig's **own look material** with two extra output modes into two RGBA8 atlas render targets:

| plane | channels |
|---|---|
| A | view-space normal x, y (8 bit each; z reconstructed) · depth offset toward the camera from the feet plane (16 bit, 0.08 mm steps over −2…+3 m) |
| B | palette slot (≤ 16) + bone side (L / R / midline, props = midline) + ghost-halo bit · look.js part id (−156…156: the outline pass's inner-line ids) · lift % · bind height / ghost height (shared-ghost fade bands) |

Then the rig is disposed. In game, each character is **one camera-facing quad** whose material is the vendor
`characterMaterial` itself (same spec options, same program family), with its shader patched so every per-vertex input
comes from the atlas per texel (`material.ts`): normal, tones (hi / mid / sh per palette slot, uniforms), part id,
lift, halo, bind height; the **far-half shadow** is re-decided live per frame from the facing and the sun (`farSideOf`
= look.js `farSide`), `gl_FragDepth` = quad depth − baked offset (the town and the cut-away occlude per texel; the
outline pass sees real depth steps), the shadow-map lookup and the self-shadow hull use the reconstructed position.
Result: day / golden / night ramps, the light pool, clouds, cast shadows from buildings, the shared ghost tones +
halo, `ghostTint` (talking rim, fade-in dither, 'tint' ghosts) and the outline pass all run the **same GLSL** as the
rig. The shadow **caster** is the cell silhouette on a vertical plane turned to the sun (approximation).

Exact texels: the bake camera copies the game camera's quaternion, centres the feet on a texel corner, and the atlas
texel = `camera.texelWorld` (viewHeight / lowH), so a sprite texel lands 1:1 on a pipeline texel (the quad is placed
with `camera.snapWorld`, like the vendor's `snapObjectToTexel`). Because lowH follows the window height, **a build-time
bake cannot be pixel-exact** (it would need one bake per window size, or non-integer resampling). Hence a runtime bake
keyed by (spec, texel, pitch, yaw); a camera that holds a new key for 0.5 s (vote camera: viewHeight 12.9, pitch 23°,
yaw 45°; resize) triggers a re-bake, one spec per frame, the old sheet stays on screen meanwhile.

Animation without the vendor Character (`spriteBody.ts`): facing = movement direction (or held face) quantised to 8
facings relative to the camera yaw, stepped one 45° per 1/15 s with 8° hysteresis (the Character's `facingSteps 8`,
`turnHold 2`); locomotion drawing = stride wheel (`phase += ds / cycle`, cycle from the bake); idle = the baked key
timing; `vote` = the baked held pose. 8 facings also cover the vote yaws ±45° (facing index is camera-relative).

## 2. Numbers

Bench: real engine + Hollowmere + avatar layer on a scripted state (no server), 15 distinct cast specs (the recon
MIX15) on a ring around the square, camera viewHeight 12 (vote: 12.887 / 23° / 45°), canvas 1280×720 CSS, DPR 1.
"frame" = layer.update + renderNow (JS); "uncapped" = the same plus a 1-pixel `readPixels` (waits for the GPU).

### 2.1 Real laptop, integrated GPU (ANGLE GL-EGL, the renderer the user's desktop Chrome uses; Chrome 143)

| low tier (640×360 RT, texel 3.33 cm) | rigs | sprites | Δ |
|---|---|---|---|
| presented fps (rAF loop, no vsync), walking | 143 (7.0 ms) | **360 (2.8 ms)** | ×2.5 |
| GPU-inclusive frame, walking (uncapped) | 11.1 ms | **5.2 ms** | −54 % |
| CPU ×4, walking: frame JS / GPU-inclusive | 8.8 / 15.8 ms | **5.9 / 9.2 ms** | −33 % / −42 % |
| avatar update (layer.update), walking | 0.47 ms (×4: 1.38) | 0.04 ms (×4: 0.16) | −90 % |
| triangles / draw calls per frame | 744 k / 266 | **312 k / 266** | −58 % / 0 |
| vote camera, CPU ×4 frame | 10.7 ms | **7.6 ms** | −29 % |
| vote camera switch: re-bake of 15 sheets | — | 744 ms spread over 46 frames, max frame 37 ms, 1 long task 60 ms | |
| join: 15 bodies built (wall) | 1.94 s, 6 long tasks, max 471 ms | 1.91 s, 12 long tasks, max 247 ms | ≈ |

| cpu tier (320×180, texel 6.67 cm) | rigs | sprites |
|---|---|---|
| presented fps, walking | 334 | **1 139** |
| GPU-inclusive frame, walking | 6.5 ms | **2.8 ms** |
| CPU ×4 frame JS / GPU-inclusive | 6.6 / 9.7 ms | **3.0 / 4.7 ms** |
| triangles | 238 k | 93 k |

### 2.2 Desktop (discrete GPU, ANGLE Vulkan) and SwiftShader

| | rigs | sprites |
|---|---|---|
| low, walking frame JS (×1 / ×4) | 1.82 / 8.17 ms | **1.12 / 5.06 ms** (−38 % at ×4) |
| high, walking frame JS (×1 / ×4) | 2.11 / 8.65 ms | **1.16 / 5.87 ms** (−32 % at ×4); tris 1.23 M → 0.80 M |
| vote camera, low, ×4 | 7.07 ms | **5.43 ms**; re-bake 15 sheets 449 ms, max frame 21 ms |
| join (15 bodies, low) | 586 ms, max long task 81 | 705 ms, max long task 82 (4 long tasks) |
| **SwiftShader, cpu tier** (presented fps, 20 s windows) | idle 11.4 / walk 10.6 fps | **idle 13.8 / walk 12.2 fps** (+21 % / +15 %) |
| SwiftShader join (15 bodies) | 9.9-12.9 s, max long task 4.6-6.6 s | 8.3-9.8 s, max long task 0.9-2.0 s |

(An accidental laptop run with `--use-angle=gl` in headless fell back to SwiftShader on the laptop CPU: walk frame JS
3.9 → 2.7 ms, ×4 19.0 → 13.9 ms; GPU-inclusive 886 → 829 ms: on SwiftShader the town's fill dominates.)

### 2.3 Bake cost, memory, bytes

| | low (texel 3.33 cm) | cpu (6.67 cm) |
|---|---|---|
| bake per spec (laptop iGPU) | 18-265 ms (15 specs: 1.5 s = rig build 227 + sim 167 + atlas renders 1 085, mostly the first compile of each spec's bake program) | 16-177 ms (1.2 s) |
| bake per spec (desktop) | 10-88 ms (15: 543 ms) | |
| drawings per spec × 8 facings | 8-14 (idle 4-8 keys, run 4, vote 1) → 64-112 cells | same |
| GPU atlas memory, 15 specs | **43.1 MB** (2.2-5.1 MB per spec, fixed cells, RGBA8 × 2) | 11.7 MB |
| atlas bytes if shipped / cached, brotli q11 | **1.60 MB** for 15 specs | 0.53 MB |
| palette conflicts (a slot with two tone pairs) | 0 in all 15 specs | |
| JS heap after forced GC (laptop, low) | 324 MiB | 329 MiB (no measurable gain: the bake rig is freed, but sheets are retained per key) |
| programs added | 11 | 11 (one sprite program per look option set, like rigs; + bake programs, compiled once) |

For scale: the 15 cast spec modules are ≈ 80 KB br as served (fullstack.md §2); a rig's skinned geometry is ≈ 3.5 MB
of GPU buffers (14 k triangles non-indexed), so 15 rigs ≈ 50 MB vs 43 MB of atlases: GPU memory is a wash; shipping
atlases would cost ≈ 20× the spec bytes and cannot be pixel-exact (§1), so **runtime bake + IndexedDB cache** is the
right shape (cache = read back once, ≈ 0.1-0.3 MB br-equivalent per spec per key).

## 3. Look: pixel diffs vs live rigs

Same engine, same moment (the town's own animation time fixed), same positions; rigs first, then sprites pinned to
each rig's displayed drawing (`spriteDebug.force`). Desktop GPU, low tier, 6 characters, full 1280×720 frame
(tolerance 6/255 per channel):

| scene | differing px | what differs |
|---|---|---|
| day, idle | 0.48-0.83 % | **cast shadows** (sun-facing silhouette ≠ the rig's 3D shadow; the largest share); 1-texel edges on figures standing on the dais steps (the rig's leg IK puts each foot on its step; sprites are baked on flat ground); frog matches texel for texel apart from 2-3 px |
| day, walk | 0.77-1.36 % | facing changes during a turn land on different frames (stepping clock), no acceleration lean / planted-foot glide; steady run drawings match |
| day, talking (3 of 6) | 0.85-1.38 % | the rim is identical; a rig plays its `talk` loop clip, a sprite keeps idle (no emote clips baked) |
| day, ghosts | 1.19-2.01 % | shared ghosts (tones, halo, fade bands) match; **'clips' ghosts** show the tinted living pose instead of their ghost loop; the dither of translucent ghosts is screen-anchored (differs by position) |
| golden | 0.82-1.14 % | shadows; creamKeep / hueKeep / whiteKeep match (same GLSL) |
| night (town light pool) | 0.46-0.84 % | shadows; lantern-lit tones match |

Stills: `docs/perf-v3/sprites/stills-rig-sprite-diff.png` (rows: day idle, walk, talk, ghost, golden, night; per
character rig | sprite | diff, ×2). At game scale (1-2 screen px per texel) the figures are indistinguishable except
the items below.

**Visible differences (lost vs the rig):**
1. Cast shadow shape (approximate caster). Fix: bake a sun-view silhouette per sun bucket, or keep a low-poly shadow
   proxy; or accept (the shadow is a soft read at game scale).
2. Feet on uneven ground (dais steps, stairs, the tower landing): no per-foot IK. Fix: bake a "stand on step" variant
   or fall back to a rig on non-flat ground.
3. Secondary motion: acceleration lean, chest / head lag, chain swing (scarves, tails), planted feet while the root
   glides (feet slide 1-2 texels inside a drawing), turn-in-place stepping detail.
4. Emotes / `talk` loops / `point` / `die` collapse / 'clips' ghost loops are not baked in the prototype (each is
   +1-8 drawings × 8 facings; `die` and ghost loops are the ones players notice).
5. Fur / feather / scale terminator hints (look.js `charHintL` needs bind xyz: one more plane).
6. High tier water reflection renders the quads facing the main camera (wrong in the mirror image).

## 4. Risks

- **Re-bake hitches**: every new camera key re-bakes every spec (vote camera, window resize, interiors' own camera).
  Measured 0.45-0.75 s for 15 specs spread one per frame, max frame 21-37 ms on desktop / iGPU. On a weak laptop
  at ×4 a single spec bake is ≈ 4× (up to ≈ 1 s for owl-class specs): needs a time-sliced bake (render a few cells per
  frame) or pre-baking the vote key during the day.
- The bake leans on vendor internals (`ch.rig.mesh`, `ch.gait`, `ch.state`, look.js uniform names, the toon hook
  strings `if (uPassMode == 1) {`, `vec4 sc = vDirectionalShadowCoord[0];`, `varying vec3 vToonWorld;`). Every patch
  `must()`-checks its anchor and throws → the layer falls back to the rig. A vendor refresh can silently change a
  look rule we copy per spec (LOOK_COPY list). CONTRACT-REQUEST(pixel3d): a supported "G-buffer output" mode in
  look.js and a public pose-sampling API (`Character.sampleDrawings()`).
- Memory: fixed-size cells waste ≈ 50-60 % of the atlas; tight bounding boxes would roughly halve 43 MB.
- Sprites need the camera pitch to be one of a few values; any free camera (debug, cinematic) re-bakes.

## 5. Recommendation

1. **Ship sprites for the `low` and `cpu` tiers first** (the laptop and CPU-only tiers), rigs stay on `high`: on the
   laptop iGPU the character share of a frame collapses (fps ×2.5 at low, ×3.4 at cpu tier; GPU-inclusive
   −54 %), at CPU ×4 −33…−42 %, SwiftShader +15-21 % fps, and the look differs only in the listed details.
2. Before that, close the gaps players will notice: bake `die` (held) and the 'clips' ghost loops + `talk`; keep a rig
   only for the own avatar on non-flat ground or skip; a better shadow caster.
3. Cache sheets in IndexedDB (key: vendor hash + spec + texel + pitch + yaw) so a repeat join skips the rig builds
   entirely (today the join costs the same as rigs: the bake builds the rig once per spec); time-slice the bake.
4. Do not ship pre-baked atlases in the build (not pixel-exact, ≈ 1.6 MB br for 15 specs at one size).

## 6. Commands run

| Command | Result |
|---|---|
| `CT_AGENT=v33-sprites scripts/remote.sh flock -s <host>/clocktower/v3-heavy.lock … tsc --noEmit -p .` (client) | ✅ after 2 fixes |
| `… pnpm -r run typecheck` | ✅ 7 projects |
| `… pnpm vitest run apps/client/test/game3d` | ✅ 32 files / 427 tests (incl. 11 new sprite tests, boundary) |
| `… env E2E_V3=1 E2E_PORT=3487 CT_GL=gpu pnpm exec playwright test -c tests/e2e/playwright.config.ts --project=v3 v3-boot v3-social v3-vote --workers=1` (switch **off**) | ✅ 3/3 (10.7 s, 8.1 s, 26.3 s) |
| same with `VITE_V3SPRITES=1` (switch **on**; dist checked: `spritesEnabled()` compiled to `return!0`) | ✅ 3/3 (10.5 s, 8.1 s, 26.5 s) |
| host: `pnpm --filter @ct/client exec vite --port 3486 --strictPort --host 127.0.0.1` + `ssh -N -L 3486` (+ `-R 3486` to the laptop) | dev server for the bench |
| `node tests/perf/v3-sprites.mjs --root <sandbox> --tiers low,high --only build,cost,throttle` (desktop GPU) | §2.2 |
| `… --only build,vote,stills --stillN 6` (desktop GPU) | §2.2 vote, §3 |
| `… --tiers cpu --gl swiftshader --only build,fps --fpsS 20` | §2.2 SwiftShader |
| `… --cdp <laptop Chrome, iGPU via ANGLE GL-EGL> --tiers low,cpu --only build,cost,throttle,fps,vote` | §2.1 |
| `… --only build,atlas --tiers low,cpu` | §2.3 bytes |
| first laptop attempt (ANGLE `gl` in headless) | ran on SwiftShader (headless has no GL surface); kept as a CPU data point, stills phase aborted |
