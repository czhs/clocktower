# 06: Character implementations for 3D pixel art (code study), adapted for three.js

Scope: community CODE and prior art for **characters** in the t3ssel8r / David Holland "3D pixel art" look. That covers
modelling, rigging, animation (stepped playback, procedural layers, second-order dynamics, IK, locomotion), crisp
rendering of moving or skinned meshes, and baking 8-direction sprite sheets. It complements `research/01-04`. Those
files cover the world renderer, so only the character-specific parts are repeated here. The character contract
already drafted in `docs/CHARACTERS.md` is cross-checked at the end (§11).

Tags: **[confirmed]** = read in the source or code, cited. **[community]** = a forum, devlog or comment claim, or code
of unknown quality. **[suggested]** = our own recommendation or derivation.

All repos were cloned into a scratch directory, not into this repo, on 2026-10-15.

---

## 0. TL;DR

1. **No public code ships a t3ssel8r-style character.** The closest is Robert-K's Godot demo (§1): a stock skinned fox
   (31 joints, about 870 verts, keyed at 24 fps in Blender). Its **pose is advanced manually at 12 fps** and its
   **root is snapped to the texel grid**. Yaw is **not** quantised, and the fox **has no outlines** (the per-material
   outline intensity is set to 0). Holland's CC0 repos contain no character code at all. His only character advice
   is a comment reply: don't snap skinned meshes, throttle the animation and rotation frame rate instead (`04-videos.md` §2).
2. **Stepped playback is a solved, tiny problem.** Two equivalent recipes:
   - Sample the clip at `floor(t·fps)/fps` (Robert-K, as `advance()` on a timer).
   - Bake the keys as constant (step) interpolation. t3ssel8r's importer does this: compression off, no resampling,
     duplicate keys removed, constant tangents, and an extra hold key at the end of non-looping clips. Root XZ motion
     is the only smooth channel.
3. **Second-order dynamics** (t3ssel8r's "Giving Personality…" video) are the standard procedural layer. Three ports
   were read:
   - iggigabriel's MIT version: fixed 100 Hz substeps with precomputed k values. It is the most deterministic and has
     **real tuned presets**.
   - Andicraft's gist (no licence): adds quaternion sign handling.
   - Overmind (no licence): uses a different stability clamp and has an init bug.

   The exact update and both stability variants are in §3.
4. **Recommended for pixel3d** [suggested]:
   - Model: rigid low-poly parts weighted 100 % to one bone each, merged into one SkinnedMesh.
   - Animation: keyed poses on twos (12 fps), plus procedural layers (SOD, two-bone IK, distance-driven gait),
     all evaluated at fixed steps and then **sampled at the pose rate**.
   - Placement: root snapped to the texel grid every frame. Yaw quantised **around world Y relative to camera yaw**.
     Do not use three.js's camera-space Euler snap: it tilts the character under a pitched camera (§5.1).
   - Normal-pass outlines like the world. Bake sprites by rendering the same rig at integer px/m with an ortho camera
     per direction.

---

## 1. Robert-K / godot-3d-pixel-art (Godot 4, MIT)

- Repo: https://github.com/Robert-K/godot-3d-pixel-art (HEAD `7dd89cf`, 2024-10-16).
- Licence: the LICENSE file is **MIT, "Copyright (c) 2021 teebarjunk"**. The copyright holder differs from the author
  (Robert Kossessa), probably a template carry-over [confirmed file content].
- The README advertises "Stepped 3D animation playback to emulate spritesheet animation" [confirmed].
- History: the player arrived in `1ba3617` (2023-11-21). The stepped playback came in `3d4aec3`
  "ADD: Player FPS Limit, lit outline test" [confirmed git log].

### 1.1 Stepped animation playback [confirmed, `scripts/player.gd`]
```gdscript
@export var animation_framerate: float = 12.0
func _ready():
    _animation_player.playback_process_mode = AnimationPlayer.ANIMATION_PROCESS_MANUAL
    _animation_timer = Timer.new(); add_child(_animation_timer)
    _animation_timer.connect("timeout", _on_animation_timer_timeout)
    _animation_timer.set_wait_time(1.0 / animation_framerate); _animation_timer.start()
func _on_animation_timer_timeout():
    _animation_player.advance(_animation_timer.get_wait_time())   # jump one display frame
func _process(_delta):
    _animation_player.advance(0)   # "update animation immediately if it changes" (play() of a new clip shows at once)
```
- The fox clips are **LINEAR keyed at 24 fps** in Blender, and they are displayed at 12 fps by sampling. Measured from
  `fox.glb` [confirmed]:

  | clip | keys | length (s) |
  |---|---|---|
  | Attack | 22 | 0.875 |
  | Fall | 41 | 1.375 |
  | Idle | 81 | 3.33 |
  | Jump | 18 | 0.708 |
  | Run | 17 | 0.667 (= 8 display frames at 12 fps) |
  | ToucheGround | 3 | 0.21 |

  So the stepping is pure **sampling of smooth clips**: no key reduction and no smear frames.
- Before the FPS limit, the idle start was randomised and rotated 20°. That code was removed [confirmed diff].
- Timer-based stepping is not deterministic. For pixel3d use `pose = clip(floor(t·fps)/fps)` (§9).

### 1.2 Pixel-perfect movement of the character [confirmed, `scenes/main.tscn`, `scripts/rendering/camera_3d_texel_snapped.gd`]
- The `Player` CharacterBody3D is in the **`"snap"` group**. The camera snaps every node of the group in its
  snap space, x/y only and depth untouched, using `call_deferred`. It reverts them on
  `RenderingServer.frame_post_draw`. This is Holland's code (identical to his `camera_3d_texel_snapped3.gd`, CC0).
  The skinned mesh deforms freely inside the snapped root.
- **Yaw is continuous**: `rotation.y = atan2(direction.x, direction.z)` every physics tick. Input is 8-way analog, so
  this is effectively up to 8 directions with instant turns. Rotation is not throttled.
- Render: SubViewport **480×270**, ortho `size = 10` (Godot ortho size = vertical extent, so 27 px/m).
  - Fox bind-pose bounds: 1.26 m tall, so about **34 px tall** on screen [confirmed numbers, derived px].
  - Upscale: the Holland display script with `texel_error` offset.

### 1.3 Outlines on the skinned mesh [confirmed, `shaders/outline.gdshaderinc`, `assets/fox/fox_toon.tres`]
- Outlines are **per-material, in the fragment shader**. The material reads Godot's `hint_depth_texture` and
  `hint_normal_roughness_texture` from the depth prepass, using a 4-neighbour kernel (Holland's algorithm). A pixel
  of this object is darkened when a neighbour is farther by more than `depth_thresh`.
- For the fox, the material sets `outline_intensity = 0.0` and `edge_intensity = 0.0`. **The character has no lines.**
  Rocks use 0.35/0.78 and stones 0.54/0.21.
- Because the outline is drawn only on the nearer object's pixels, the terrain behind the fox doesn't outline it
  either. The likely reason is that the 1024² painted texture and smooth skinned normals (§1.4) produce noisy
  normal edges [suggested].
- pixel3d already has a global post outline (normal-pass flag). The decision for characters is a **flag choice**,
  not a new technique (§9.3).

### 1.4 Character model [confirmed, `assets/fox/fox.glb`]
- Generator: "Khronos glTF Blender I/O v1.6.16". 7 meshes (hood, hands×2, legs×2, tail, sword), 31 joints including a
  **4-bone tail** (`Tail_1..4`), about 870 vertices.
- Textures: 1024² diffuse and normal map, 512² sword maps. The materials are `diffuse_mode=3` (toon) with alpha scissor.
- The **provenance and licence of the fox model are not stated** anywhere in the repo. Do not reuse it.
- Cel shading for all materials: a global `cel_cuts = 3`, with
  `stepped = clamp(d + mod(1 - d, 1/cuts), 0, 1)`.

**Use in pixel3d characters?**
- Adopt: the sampled stepped-pose recipe (12 fps) and the root-only snap.
- Improve on: yaw (quantise it), outlines (ON, via the flag), and textures (vertex colours, not painted 1024² maps).
- Don't copy: the asset.

---

## 2. David Holland (denovodavid): repos and character relevance

- GitHub `denovodavid`, 20 repos (API listing): `godot` (MIT fork, updated 2024-04-01), `raylib` (Zlib fork),
  `Odin`, `glamour` (Rust/OpenGL), `schema` (C++ ECS), `every-trees`, `fitting-frenzy`, game-jam repos, and others.
  **None contains 3D-pixel-art character code** [confirmed by listing; names and descriptions checked].
- `git clone https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot` **worked**. HEAD `675e9c5`, 2025-08-03,
  "⬆️ godot 4.4". CC0 1.0.
  - Contents: `01-camera/part01..03` (texel-snapped camera, display/upscale, phantom-camera variant) and
    `02-lines/object_showcase` (outline shader, cylinder and icosphere GLBs, a `rotating.gd` that rotates
    continuously at −45°/s).
  - No skinned meshes, no animation code, no frame-rate throttling. **The "snap" group is the only moving-object
    mechanism** (`_snap_objects` and `_snap_objects_revert`, same as §1.2) [confirmed].
- His article https://www.davidhol.land/articles/3d-pixel-art-rendering/ mentions only "basic character movement" in
  a raylib framework, and that "Low poly models with clearly defined outer edges suit best" [confirmed via fetch].
- The only character-specific guidance is his reply under the Part 3 camera video (already in `04-videos.md` §2.6):
  "Animated skinned meshes: don't snap them. Throttle animation and rotation **framerate** instead" [community, as
  recorded by research/04].
  - Interpretation [suggested]: per-vertex snapping of a skinned mesh is impossible on the CPU and ugly in a vertex
    shader (vertices collapse). So snap the **root**, as Robert-K does, and let the low pose rate hide sub-texel
    limb motion.
  - Limb motion only changes on pose frames, so the residual shimmer is "a new drawing every 83 ms", which reads as
    hand-animated.

**Use in pixel3d characters?** Yes for the policy: root snap, throttled pose rate, throttled rotation. pixel3d's
`camera.snapObjectToTexel(obj)` already implements the snap-and-restore (`src/core/PixelCamera.js:170`).

---

## 3. Second-order dynamics (SOD): the procedural layer

Source of the maths: t3ssel8r, "Giving Personality to Procedural Animations using Math" (https://youtu.be/KPoeNZZ6H4s).
The system is `y + k1·y' + k2·y'' = x + k3·x'` with

```
k1 = ζ/(π f)        k2 = 1/(2π f)²        k3 = r ζ/(2π f)
```

The parameters:
- `f` is the natural frequency in Hz (speed of response).
- `ζ` is damping: 0 means it never settles, below 1 it oscillates, 1 is critical, above 1 it is sluggish.
- `r` is the initial response: below 0 it anticipates, 1 tracks immediately, above 1 overshoots.

(The parametrisation is identical in all ports below [confirmed].)

### 3.1 Canonical update (semi-implicit Euler) and the two stability clamps
```js
// per step of length T, input x (target); xd = input velocity (estimated if not given)
xd = (x - xp) / T; xp = x;
y  = y + T * yd;                                         // integrate position by velocity
yd = yd + T * (x + k3*xd - y - k1*yd) / k2s;             // integrate velocity by acceleration
```
- **Clamp A ("no jitter")**: `k2s = max(k2, T*T/2 + T*k1/2, T*k1)`. Used by iggigabriel (algebraically identical, see
  3.2), `smartkiiwii/candy-crush-phaser`, `landongn/wsvelte`, `bartoszlorek/darkmaze` [confirmed via code search].
- **Clamp B ("just stable")**: `k2s = max(k2, 1.1*(T*T/4 + T*k1/2))`. Used by Overmind, `Magnogen/*`, `minetoblend/osucad`,
  `ghimpuiosif/hero-3d` [confirmed via code search].
  - B allows faster response at large T but can ring at the frame rate.
  - **Use A** for pixel art: ringing at the step rate shows as 1-texel flicker [suggested].
- **Pole-zero matching** for `ω·T ≥ ζ` (very high f relative to the step) [community: `landongn/wsvelte/src/3d/Rig.ts`;
  the shape matches the video]:
  ```js
  const w = 2*Math.PI*f, d = w*Math.sqrt(Math.abs(z*z - 1));
  if (w*T < z) { k1s = k1; k2s = Math.max(k2, T*T/2 + T*k1/2, T*k1); }
  else { const t1 = Math.exp(-z*w*T), alpha = 2*t1*(z <= 1 ? Math.cos(T*d) : Math.cosh(T*d)),
               beta = t1*t1, t2 = T/(1 + beta - alpha);
         k1s = (1 - beta)*t2; k2s = T*t2; }
  yd += T*(x + k3*xd - y - k1s*yd)/k2s;
  ```
  - With a fixed 1/60 s step this branch only triggers for `f ≥ ζ·60/2π ≈ 9.5·ζ Hz`. Characters never need it if f
    stays ≤ 6 Hz [suggested].
  - (`wsvelte` itself is buggy: it reuses one `velocity` for both xd and yd. Copy only the formula.)

### 3.2 iggigabriel / DynamicsStudy (Unity, Burst; **MIT**, © 2022 Iggi): the best reference
- Repo: https://github.com/iggigabriel/DynamicsStudy (HEAD `8e2957c`, 2023-05-17).
- Runtime: `Assets/SecondOrderDynamics/Runtime/{SecondOrderDynamics,SODCurve,SODState,SODValue}.cs`.
- Fixed internal step `DeltaTime = 1/100`. It substeps, then **linearly extrapolates the display value** by the
  leftover fraction [confirmed]:
  ```csharp
  state.timeFraction += deltaTime / DeltaTime;
  while (state.timeFraction >= 1f) {
      state.previousValue += state.velocity * DeltaTime;
      state.velocity += (state.target + k.z*(state.target - state.previousTarget) - state.previousValue - k.x*state.velocity) / k.y;
      state.timeFraction -= 1f; state.previousTarget = state.target;
  }
  state.value = state.previousValue + state.velocity * state.timeFraction * DeltaTime;
  ```
  The k values are precomputed with T folded in:
  ```csharp
  f = max(0.001, PI*frequency); fdbl = 2f*f;
  k.x = damping/f;                                   // = k1
  k.y = 1/(fdbl*fdbl);                               // = k2
  k.y = max(k.y, DT*DT/2 + DT*k.x/2);
  k.y = max(k.y/DT, k.x);                            // = max(k2, T²/2+Tk1/2, T k1)/T   → clamp A
  k.z = response*damping/fdbl/DT;                    // = k3/T (multiplied by Δx gives k3·xd)
  ```
  This matches clamp A exactly [confirmed algebra].
- Variants:
  - `SODFloat`, `SODFloat2/3/4`.
  - `SODAngle`: `SetTargetNormalized` keeps the target within ±180° of the previous target, so it doesn't spin
    the long way.
  - `SODQuaternion`: **component-wise on float4, no sign fix, no renormalisation.** It works only for small
    rotations. Avoid it.
  - The HexTile sample animates an **up vector** (`rotationMod.Target = normalize(Up + translation/2)`) instead of a
    quaternion, a nice trick for tilt/lean.
- Impulse pattern ("jiggle"): the target stays at 0 and the motion delta is pushed into velocity:
  `jiggle.Velocity += 0.5*force*dt*(lastPos - pos)`, then `euler = (v.y, 0, -v.x)*360°`. Ideal for antennae, hats,
  ears and tails driven by root motion [confirmed `Samples/Playground/Scripts/Jiggle.cs`].
- **Tuned presets**, parsed from the shipped prefabs and scene, as (f, ζ, r) [confirmed]:

  | where | what | f | ζ | r |
  |---|---|---|---|---|
  | `SODCurve` statics | Default / Damped / Elastic / Undershoot | 1,1,1 / 3,0.5,−2 / 4,0.3,0 / 4,1,−1.5 | | |
  | Camera | yaw (`targetAngle`) | 3.3 | 0.66 | −0.66 |
  | Camera | pitch | 2 | 1 | −0.1 |
  | Camera | look-at | 1.15 | 0.77 | −0.15 |
  | Camera | position (`targetLookFrom`) | 10 | 1 | 1 |
  | FollowTarget | position | 1 | 1 | 1 |
  | Cube | position driver | 1 | 0.6 | 0 |
  | Car | body roll / pitch (impulse) | 1 / 1.61 | 0.2 / 0.38 | 0 |
  | Car antenna | jiggle (impulse) | 1.44 | 0.1 | 1 |
  | GooglyEye | jiggle (impulse) | 2.29 | 0.01 | 1 |
  | HexTile | position / tilt (up-vector) / drag scale | 3.56,0.7,0 / 2.9,0.3,−1.33 / 2,1.6,0.75 | | |
  | PunchDummy | stump hit / body hit / spin (impulse) | 2.66,0.33,2 / 2,0.43,−4.17 / 1.78,0.13,0 | | |
  | Bell, NewtonSphere | rotation (impulse) | 1.36 | 0.02 | 0 |

**Use?** Yes. Port it to JS with the substep and fraction scheme (deterministic with any frame dt), clamp A, and the
up-vector or swing-twist trick for rotations.

### 3.3 Andicraft gist (Godot 4 C#; **no licence**, 2024-02-16)
- Gist: https://gist.github.com/Andicraft/ab605dda924a0321e755abf8f573ebd7. It is one generic
  `SecondOrderDynamics<T>` class using `dynamic`, with clamp A, variable dt, and an optional externally supplied
  input velocity (`setVelocity`).
- Its comments give the clearest plain-language guide to the parameters [confirmed].
- `QuaternionDynamics`:
  ```csharp
  NormalizeSign(y, ref x);                 // if dot(current, target) < 0, negate target
  return base.Update(dt, x, ...).Normalized();
  ```
  - Pitfall [suggested]: `xp` (previous input) was stored before the sign flip. When the target crosses the hemisphere
    boundary, `xd = (x - xp)/dt` gets a huge spike and kicks the k3 term. Fix it by also sign-aligning `xp`, or by
    passing `r = 0` for rotations.
  - The internal `y` is never renormalised, only the output. That is fine for small steps.
- **Author's character-rig comment** (2024-10-13), the most useful code in the gist. Body orientation is the product
  of three parts, then filtered by `QuaternionDynamics`:
  - foot-derived up: the average direction from the two feet to the body, blended to identity when no foot is
    planted, weighted by `(1 - speedFactor)²`;
  - acceleration lean: velocity minus an exponentially filtered velocity, rotating `3°` per (m/s) about
    `cross(accDir, up)`;
  - forward speed lean: `speedFactor * BodySpeedLean`, or 60° when crouching.

  ```csharp
  var targetRot = footQuat * accLean * lean * Quaternion;
  BodyNode.Quaternion = _bodyRotationDynamics.Update(dt, targetRot);
  ```
  [confirmed comment; the lean factor 3°/(m/s) and the 0.2 s filter come from it.]

**Use?** Use the ideas (sign handling, the lean recipe). Don't copy the code (no licence; trivially re-derivable).

### 3.4 VioletaSaravia / Overmind (Godot camera addon; **no licence** per the GitHub API, 24★)
- `resources/damped_value.gd` uses clamp B with a 1.1 factor and a variable dt.
- **Bug**: `start(x0)` sets `_yd = x0` (velocity initialised to the position). A camera starting at x = 10 starts with a
  velocity of 10 units/s [confirmed].
- No presets ship (the defaults are `freq 1, damp 1, resp 0`). It applies DampedValue per axis or channel:
  horizontal, vertical, distance, angle, rotation, look [confirmed `nodes/virtual_camera_3d.gd`].

**Use?** No. It is only evidence that clamp B is in circulation.

### 3.5 Parameter presets for pixel3d characters [suggested; anchored on §3.2 and Andicraft where marked]
Rule: on a 12 fps pose clock, anything above about 4 Hz shows as noise. Keep ζ ≥ 0.3 for anything that should
settle within one cycle. Use `r < 0` only for deliberate anticipation.

| layer | driven value | f | ζ | r | notes |
|---|---|---|---|---|---|
| body follow (visual root lags the logical position) | Vector3 | 3.0 | 0.8 | 1.0 | fast enough not to slide the feet. Usually leave the root unfiltered and apply SOD only to lean and bob |
| body lean from acceleration | up-vector or angle | 2.0 | 0.5 | 0 | target tilt = min(3°·|v − filtered v| (Andicraft, filter 0.2 s), 12°) |
| facing yaw (before quantising) | angle | 2.5 | 0.7 | 0 | ≈ camera yaw 3.3/0.66 (iggi). Quantise the output to 8 dirs |
| head look-at | angle pair | 3.5 | 0.6 | 0 | about 1.5× body f, so the head leads (personality) |
| tail / ears / antenna (impulse) | angle(s) | 1.5–2.3 | 0.1–0.3 | 1 | iggi antenna 1.44/0.1/1, googly eye 2.29/0.01/1. Use ζ ≥ 0.15 at 12 fps |
| cape / scarf chain (per link, increasing lag) | angle | 2.2 → 1.6 | 0.45 | 0 | 0.85× f per link down the chain |
| squash and stretch (landing, hit) | scalar scale | 4.0 | 0.35 | 0 | impulse into velocity. Clamp ±15 %, volume-preserving `sx = sz = 1/sqrt(sy)` |
| hit recoil | angle | 2.0 | 0.43 | −4 | ≈ PunchDummy bodyHit (anticipation-heavy) |
| camera follow | Vector3 | 1.15 | 0.77 | −0.15 | iggi look-at. pixel3d's camera owns its own easing, so use this only for a game camera |

---

## 4. t3ssel8r: Pixel Animation Importer (Unity editor script; **no licence**; brief)

- Gist: https://gist.github.com/t3ssel8r/aba0b33369ea620a63917f4ac21fd585, created 2021-06-16, the same week as
  "Making an Animation for my 3D Pixel Art Game". Only comment: the author's "Please consult the code if there is any
  uncertainty as to what it does."
- What it does to each imported clip [confirmed]:
  1. Sets `animationCompression = Off` and `resampleCurves = false`, so the authored keys (from Cascadeur) survive
     unchanged.
  2. Fresh import: locks root rotation and root height, and keeps the original orientation and position.
     **Root XZ motion is optional** (`useRootMotion`).
  3. Custom curves (events or params): key times are rounded to the frame grid with
     `round(time·frameRate)/frameRate`.
  4. Every other curve:
     - **deletes duplicate consecutive keys**, so holds become a single key;
     - sets **Constant** tangents left and right (stepped, no interpolation).

     Exception: `RootT.x` and `RootT.z` get `ClampedAuto` (smooth) tangents when `smoothRootMotion` is on, so the body
     glides while the pose steps.
  5. Non-looping clips get a duplicate final key one frame later (`+1/frameRate`), so the last pose is shown for a
     full frame. Smooth root curves instead get all keys pushed forward one frame.
  6. Animation event times are rounded to frames.
- Takeaway: **the pose is on a frame grid with holds, and the root translation is continuous.** That is exactly the
  pixel3d split: `poseFps` for bones, per-frame snapped root.

**Use?** The policy, yes. Re-implement as a "bake clip to steps" helper: given keys at frame indices, produce
`InterpolateDiscrete` tracks plus a final hold key.

---

## 5. three.js examples, Kody King, bababuyyy, WiseFrame: character relevance

### 5.1 three.js `webgl_postprocessing_pixel` (MIT)
- r170 contains **no character**: boxes, a plane, an icosahedron "crystal", and a spotlight [confirmed grep of the r170
  file].
- The current `dev` version adds object snapping helpers [confirmed, read 2026-10-15]:
  - `pixelAlignObject(obj, cam, pxW, pxH)` decomposes the position onto camera right/up/forward, rounds right/up to
    pixel units, and recomposes.
  - `snapObjectRotation(obj, cam, incDeg)` (default `rotationSnap: 15`):
    ```js
    const relative = camRot.clone().invert().multiply(object.quaternion);
    const e = new THREE.Euler().setFromQuaternion(relative);
    e.x = round(e.x/inc)*inc; e.y = round(e.y/inc)*inc; e.z = round(e.z/inc)*inc;
    object.quaternion.copy(camRot.multiply(relative.setFromEuler(e)));
    ```
  - Both are applied before `composer.render()` and restored afterwards. The comments note that they snapshot the
    **Euler** rotation, because restoring the quaternion "would let three.js re-derive a gimbal-equivalent euler".
  - Animation helpers: `stopGoEased(t, downtime, period)` (hold, then ease) and emissive pulse quantised to 6 levels.
- **Pitfall for characters** [suggested, derived]: under a pitched camera (pixel3d pitch 30°), a pure world-Y yaw is
  *not* a single camera-space Euler axis. Rounding e.x and e.z then **tilts the character** by up to the increment.
  For characters, quantise yaw about world +Y relative to camera yaw instead:
  ```js
  const rel = yaw - camera.yaw;
  qYaw = camera.yaw + Math.round(rel/(2*Math.PI/N))*(2*Math.PI/N);
  ```

### 5.2 KodyJKing / hello-threejs (TypeScript; no formal licence)
- `src/index.ts` has a **commented-out** FBX "mech" loader. It is a static mesh, scaled 0.001, with a Phong material:
  no skinning and no animation [confirmed].
- Nothing character-specific. (The rendering is covered in `03-implementations.md` §2.)

### 5.3 bababuyyy / unity-isometric-pixel-pipeline (Unity 6 URP, MIT)
- The only "character" is `PlayerPlaceholder.cs`: a Rigidbody capsule with camera-relative WASD at 5 m/s, jump
  impulse 5, and a spherecast ground check. **No animation, no rig** [confirmed].
- The README limitations list has nothing about characters [confirmed].
- Relevant warning: grass is excluded from depth/normals, so "a crease line may appear at the base" of objects
  standing in grass. Characters' feet in grass will get the same crease [confirmed README, applies to us].

### 5.4 WiseFrame "Godot pixel-art shaders" #1 and #2 (stock Godot 4.7; licence not stated)
- #1: https://wiseframe.dev/godot-pixel-art-shaders-pipeline-and-quantization. 640×360 SubViewport, nearest 3×
  upscale, `floor(x·n)/n` quantisation.
- #2: https://wiseframe.dev/godot-pixel-art-shaders-toon-lighting-and-dithering. `floor(N·L·bands)/bands` with
  4 bands, a 4×4 Bayer gate on light strength indexed by `FRAGCOORD`, and the "gray-shadow trap": ambient light
  isn't quantised, so use `render_mode ambient_light_disabled`.
- **Nothing on characters, animation or snapping** [confirmed via fetch].
- One implication [suggested]: screen-anchored dither on a moving character "swims". Don't dither character shading
  (pixel3d doesn't dither shading anyway, `02-t3ssel8r.md` §9).

---

## 6. Prior art: 3D → pixel-art character pipelines

Some sources were unreachable: Reddit (403 to tools), Medium (Cloudflare), GDC Vault (paywalled; no primary text for
the Rosen or Rain World talks), and aigamedev.com (DNS dead). Claims from those sources are marked accordingly.

### 6.1 Dead Cells (Motion Twin): Thomas Vasseur, "Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells" (Game Developer, 2018-01-25)
URL: https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-

- Pipeline [confirmed]:
  - A 2D pixel model sheet, then a rough model and skeleton in **3ds Max**, exported as **FBX**. The modelling is
    crude on purpose because the character is tiny.
  - An in-house tool renders each frame "in a very small size and without antialiasing". The in-game character is
    "only 50 pixels" tall.
  - Each frame is saved as a **PNG plus a normal map**. A toon ("cell") shader gives volume, and the game's lighting
    replaces hand-painted shading.
- Animation [confirmed]:
  - Keys are timed first with as few frames as possible. Extra frames go "before or after the key frames. Never
    in-between": pose-to-pose, with VFX carrying the motion.
  - The only frame rate quoted is the Flash prototype's 30 fps. There are no per-clip frame counts.
- Known flaw [confirmed]: they "haven't found any solution for flickering pixels" and accept it rather than clean
  frames by hand.
- Motivation [confirmed]: one animator; retiming or re-posing (e.g. nerfing an attack by slowing it) takes minutes;
  rigs and armour are reused across monsters.
- Lessons for pixel3d [suggested]:
  - Our bake (§9.6) is the same idea in three.js.
  - Export the normal pass alongside the colour so 2D games can relight.
  - Edge flicker between frames is inherent, so keep parts ≥ 2 texels and review strips.

### 6.2 Guilty Gear Xrd: Junya C. Motomura, GDC 2015, "GuiltyGearXrd's Art Style: The X Factor Between 2D and 3D"
Official handout with speaker notes (34 pp., read in full): https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf

All points below are [confirmed].
- **Meshes and data:** about 40k-triangle meshes, **no normal maps**. Everything lives in vertex data.
- **Toon test:** `step(threshold, dot(L, N))`.
  - One **vertex-colour channel offsets the threshold**: hand-painted occlusion, where 0 means always shaded.
  - **Each character has its own light vector**, tuned for its idle pose and adjusted per frame in cutscenes.
  - **Vertex normals are hand-edited** on faces and major forms.
- **Colour:** a base texture gives the lit colour, multiplied by a "tint" texture for the shade colour (e.g. reddish
  shade on skin). Both are flat swatches used as lookups.
- **Outline:** inverted hull with width from camera distance and a vertex channel. Inner lines are axis-aligned
  texture beams with UVs set along them.
- **Animation:**
  - Limited animation, "No interpolation between keyframes", posed like stop-motion. **No numeric fps is given.**
  - About 500 bones, all hand-keyed, with no simulation ("doesn't look 2D").
  - **Scale keys** do squash and stretch, exaggeration and hiding parts. "Intentional discontinuity and imperfection"
    is added: limbs are rescaled per key for perspective, and face parts move off-model.
- Lessons for pixel3d [suggested]:
  - Put art direction into data an agent can write: a per-part **shadow bias**, which maps to toon.js's `cutMod`
    hook; **custom normals** for heads (sphere-projected normals on a chamfered box → clean 2-band head shading,
    via the `normalOverride` hook); and per-key **bone scale** in poses.
  - No physics-looking secondary motion on the main pose. SOD layers must also be stepped (§9.4).

### 6.3 David Rosen (Wolfire), "An Indie Approach to Procedural Animation" (GDC 2014 Animation Bootcamp)
Session: https://www.gdcvault.com/play/1020583 (paywalled). Summary page:
https://www.gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation

- Official blurb [confirmed]: fluid interactive animation "using very few key frames" (Overgrowth, Receiver, Black Shades).
- From the forums [community]:
  - "Only 13 keyframes in total for everything" (Unity forum, 2014).
  - Spring-like interpolation instead of linear; simple cycles from poses, the rest left to physics and ragdoll;
    IK is "just trigonometry".
  - A **stride / surveyor wheel**: cycle phase = distance travelled / stride length, driving a blend through
    pass → reach → pass(mirror) → reach(mirror) poses. Phase follows distance, not time, so feet never skate.
    (https://discussions.unity.com/threads/surveyor-wheel-technique.251435/)
  - A student recreation used 4 keys per walk or run, plus 1 crouch and 1 idle key.
- Not verified: "walk cycle ≈ 2 frames" [unverified].
- Wolfire blog "Angular and linear keyframe blending": linear blending of positions makes a hand pass through the
  thigh; angular blending propagates local rotations from the pelvis [unverified, snippet only].
- Related, read [confirmed]: Little Polygon's locomotion post (https://blog.littlepolygon.com/posts/loco1/).
  - Lean axis = `cross(up, accel)`, smoothed by a damped spring, capped at 45°.
  - Feet: ground snap plus two-bone IK.
  - Hips: a sine with phase advanced by normalised speed.

### 6.4 Rain World (Joar Jakobsson): TIGSource devlog
Source: full mirror https://candlesign.github.io/Rain-World-Devlog/Full%20devlog. The GDC 2016 talk is paywalled.

All points below are [confirmed].
- **Bodies are point chains** held at fixed distances, with "two functions": distance and direction. The player is
  2 points, a lizard 3, and tails are chains. Sprites are drawn between points (an arm at the shoulder, rotated
  toward the hand point). Creatures are flat single colours because overlapping shaded sprites would show seams.
- **Faked locomotion:**
  - A "magical force" moves the body.
  - A limb left too far behind enters "search mode" and grabs a scored position ahead: air scores −∞, terrain
    scores higher the nearer it is to an "ideal" point along the motion.
  - Propulsion scales with the number of attached limbs, so speed syncs to the gait.
  - Daddy Long Legs adds a temp grab position improved each frame by random sampling.
  - Elbows and knees use "a simple inverse kinematic formula".
- Lesson [suggested]: for multi-legged NPCs (spiders, crabs), use body steering + scored footholds + release-when-behind
  + analytic two-bone IK. In pixel3d, make it deterministic: score candidate footholds on a fixed lattice along the
  path, not by random sampling.

### 6.5 Devlogs: 3D models rendered as pixel characters
- **t3ssel8r, "Making an Animation for my 3D Pixel Art Game"** (https://youtu.be/1FrIBkuq0ZI; English captions read) [confirmed]:
  - Blocks the swing with Cascadeur auto-posing, then converts selected frames to keys and deletes the rest. For
    small motions this "emulates the effect of animating on twos".
  - Uses **no mid-swing in-betweens**: "represent the bulk of the motion in a single frame smear", generated in engine.
  - Smear: generated when per-frame sword motion is large and roughly along the blade. A **cubic Bézier of position and
    orientation**, with handles aligned to the blade axes to approximate a circular arc; the texture gets streakier as
    it fades.
  - Uses **wide flat swings** that read from any camera angle, rather than per-direction swings.
  - About 90 minutes of animation work.
  - Cascadeur interview (https://cascadeur.com/blog/general/making-an-animation-for-a-3d-pixel-art-game): large
    actions use smears, small actions use held duplicate frames, models are simple, and he expects a couple dozen
    player clips.
- **Leo Svanå, "Converting 3D to 2D Pixel Art | Devlog #1"** (https://youtu.be/q_7JRw4jIO4, 2021-08-09) [confirmed]:
  - Mixamo rig and animations; Blender cartoon shader rendered at 64×64.
  - Then a real-time Unity version: a second "pixel camera" copying the main camera renders to a low-res
    RenderTexture, with a toon shader and "a black outline to make it look less messy". Real lights affect the
    character.
- **aarthificial (Astortion)** [confirmed]:
  - Animations run at **10 fps**.
  - Unity's Animator switches clips mid-frame (a 20 ms frame instead of 100 ms), which causes stutter. His custom
    animator **waits for the current frame to finish before switching** (Legacy #4, #15).
  - Devlog #26: sprite pixels store UVs into a skin lookup texture, so recolours and outfits propagate to all frames.
- **Blender Studio, "Playable Stop Motion in Godot" (DOGWALK)** (https://studio.blender.org/blog/playable-stop-motion-in-godot/, 2025-08-28) [confirmed]:
  - Animated on twos (about 12 fps), sometimes threes (about 8 fps), with gameplay at 60+ fps.
  - A **"ValueSlicer" quantises continuous values with hysteresis**. Rotation snaps to 16 base angles, with 8/16/32
    slicers chosen by angular velocity.
  - Stepped blends use about 5 slices. Transitions are instant via matching in/out poses.
  - **Snapped visuals are kept separate from gameplay values.**
  - glTF sampling interpolation fallback = Step.
- Others [unverified]: Elliot Bentine (ProPixelizer) on per-object low-res targets plus position snapping (Medium,
  bot-walled). A Unity forum thread notes that depth/normal outlines double or skip on small parts.

---

## 7. Procedural locomotion and IK (JS-relevant code)

### 7.1 Two-bone IK
- **three.js `CCDIKSolver`** (MIT, r170 `examples/jsm/animation/CCDIKSolver.js`) [confirmed]:
  - `new CCDIKSolver(skinnedMesh, iks)`, where `iks = [{target, effector, links:[{index, limitation, rotationMin,
    rotationMax}], iteration, minAngle, maxAngle}]`. The target and effector are **bone indices**, so the target must
    itself be a bone.
  - It is iterative and **incremental on the current pose**, with no pole vector; the hinge `limitation` is marked TODO
    in the source; it requires a SkinnedMesh and was designed for MMD.
  - **Verdict: no.**
- **Daniel Holden, "Simple Two Joint IK"** (https://theorangeduck.com/page/simple-two-joint; no licence, algorithm
  only) [confirmed]:
  - Law of cosines for the new hip and knee interior angles, applied as deltas about `axis0 = n(cross(c-a, b-a))`
    (stable variant `cross(c-a, kneeForward)`).
  - Then it rotates the chain from `c-a` onto `t-a`.
  - Reach clamp: `|t-a| ∈ [eps, lab+lcb-eps]`.
- **Unity Animation Rigging `SolveTwoBoneIK`** (Unity Companion Licence, so reimplement only) [confirmed]:
  - Same triangle-angle step.
  - A **hint (pole) step** projects `ab` and `hint-a` onto the plane ⟂ `ac` and rotates the root by
    `FromToRotation(abProj, ahProj)`. It is skipped when `|abProj|² ≤ 0.001·maxReach²`.
- **majidmanzarpour/threejs-procedural-spider** `src/core/dynamics.js` (**MIT**) [confirmed]. A pure knee-position solver:
  ```js
  export function twoBoneKnee(root, target, l1, l2, poleDir, out) {
    _t.subVectors(target, root);
    const dist = clamp(_t.length(), 1e-3, l1 + l2 - 1e-3);
    _d.copy(_t).normalize();
    _bend.copy(poleDir).addScaledVector(_d, -poleDir.dot(_d));      // pole projected ⟂ to the reach axis
    if (_bend.lengthSq() < 1e-6) _bend.set(0, 1, 0).addScaledVector(_d, -_d.y);
    _bend.normalize();
    const a = Math.acos(clamp((l1*l1 + dist*dist - l2*l2) / (2*l1*dist), -1, 1));
    return out.copy(root).addScaledVector(_d, Math.cos(a)*l1).addScaledVector(_bend, Math.sin(a)*l1);
  }
  ```
  It also has `orientCyl(mesh, a, b, r)`, which places a Y-cylinder between two points with
  `setFromUnitVectors(Y_UP, dir)`. The repo itself is stateful (uses `performance.now()`); only these helpers are pure.
- **Other libraries:**
  - jsantell/THREE.IK: MIT, FABRIK, "work in progress".
  - gkjohnson/closed-chain-ik-js: Apache-2.0, damped least squares.

  Both are iterative and history-dependent. **No.**
- **Recommended for pixel3d** [suggested, numerically checked by the sub-agent]: solve the knee position as above
  (with a lower clamp `|l1-l2|+eps`), then **rebuild bone orientations from scratch every evaluation**, without
  accumulating:
  ```js
  hinge = normalize(cross(d, bend));
  // per segment:
  y = normalize(child - joint); x = hinge; z = cross(x, y);
  qWorld.setFromRotationMatrix(m.makeBasis(x, y, z));
  bone.quaternion = parentWorldQ⁻¹ · qWorld;
  ```
  Optional soft-IK near full extension to avoid the knee pop:
  `if (dist > L - s) dist = (L - s) + s*(1 - exp(-(dist - (L - s))/s))` [community].

### 7.2 Foot planting: a distance-phased stride wheel (pure in t)
- Stateful references, ideas only:
  - runevision/LocomotionSystem (MPL-2.0): per-leg stance/lift/strike fractions of the cycle.
  - lchaumartin/SpiderProceduralAnimation (no licence): a leg steps when its target drifts > 0.15 from the last plant,
    one leg at a time, and the step arc is `lerp + up·sin(π u)·h` over 8 updates.
  - threejs-procedural-spider (MIT): `baseFreq 1.55, duty 0.7, stepH 0.65, stepThresh 0.85`, wave-gait offsets
    `0.5, .33, .17, 0, .5, .67, .83, 0`, Cruse rule "never swing if a neighbour swings".

  **Threshold triggers need history: avoid them.**
- **Pure formula** [suggested, derived and checked: continuous; stance range ±βS/2; 20 % double support at β = 0.6]:
  ```js
  // s: arclength along the (pure-of-t) path; S: stride = 2 steps; o: 0 (L) / 0.5 (R); beta: duty ≈ 0.6; h: lift
  function foot(s, S, o, beta, h) {
    const p = s/S + o, k = Math.floor(p), f = p - k;
    const plant = kk => (kk + beta/2 - o) * S;           // foot under the hip at mid-stance
    if (f < beta) return { s: plant(k), y: 0 };          // stance: world-locked
    const u = (f - beta) / (1 - beta);                   // swing
    return { s: plant(k) + S*u*u*(3-2*u), y: h*Math.sin(Math.PI*u) };
  }
  ```
  - Body layers from the same phase:
    - vertical bob `A·cos(4π(p-β/2))`: 2 per stride, highest at mid-stance;
    - lateral sway `±L·cos(2π(p-β/2))`: 1 per stride;
    - pelvic yaw `∝ cos 2πp`;
    - arms = opposite-leg angle × gain.
  - **End walk segments where both feet are planted**: `(s/S) mod 0.5 < β - 0.5`.

### 7.3 Gait numbers (humans; scale for chibis)

| quantity | value | tag |
|---|---|---|
| stance / swing | ≈ 60 / 40 %, double support ≈ 2 × 10 % | [confirmed] Wikipedia "Gait (human)" |
| vertical CoM bob | ≈ 5 cm, 2 per stride | [confirmed] OUHSC gait page (Saunders/Inman 1953) |
| lateral sway | ≈ 5–6 cm, 1 per stride | [confirmed] OUHSC |
| pelvic rotation / list | ≈ ±4° / ≈ 5° | [community] |
| cadence | ≈ 100–120 steps/min | [community] |
| walk→run | Froude `v²/(g·L)` ≈ 0.5; walking maximum ≈ 1 | [confirmed] Wikipedia "Froude number" |
| stride / hip height | λ/h ≈ 2.3·Fr^0.3 (Alexander) | [unverified constants] |
| arm swing | ≈ ±15–20° | [unverified] |

### 7.4 three.js r170 skinning facts [confirmed in r170 source, tag commit `beab9e8`]
- Skinning is automatic for any non-raw material on a `SkinnedMesh`:
  - `WebGLPrograms.js:311` sets `skinning: object.isSkinnedMesh === true`, and `WebGLProgram` adds `USE_SKINNING`.
    There is **no material flag**. `RawShaderMaterial` gets no prefix.
  - Chunk order in a custom ShaderMaterial: `skinning_pars_vertex`; then `beginnormal_vertex → skinbase_vertex →
    skinnormal_vertex → defaultnormal_vertex → begin_vertex → skinning_vertex → project_vertex`.
  - `onBeforeCompile` on built-ins (pixel3d's toon = patched `MeshLambertMaterial`) keeps all of this. The shadow
    `MeshDepthMaterial` skins as well.
- `mesh.bind(new Skeleton(bones))` without a matrix makes the current pose the bind pose. `BufferGeometryUtils.mergeGeometries`
  merges parts. **Rigid skinning** (each part has `skinIndex = (bone,0,0,0)` and `skinWeight = (1,0,0,0)`) gives one
  draw call per character with no blend artefacts (this is what `src/chars/spike.js` does).
- **Culling:** `SkinnedMesh.computeBoundingSphere()` uses the posed vertices, but only once, while it is null, and the
  frustum test then reuses that sphere. Set `frustumCulled = false` on characters, or recompute it per pose frame.
- Stepped tracks:
  - `THREE.InterpolateDiscrete` (2300) via `track.setInterpolation(...)` or the 4th constructor argument.
  - `QuaternionKeyframeTrack` has no Smooth mode.
- `AnimationMixer.setTime(t)` zeroes mixer and action time, then calls `update(t)`. But `_loopCount` is not reset
  (PingPong becomes history-dependent), LoopOnce disables the action, and fades or warps are scheduled on mixer time.
  **Don't use the mixer for pure-of-t playback.** Evaluate `track.createInterpolant().evaluate(tq)` or our own key
  tables.
- `SkeletonUtils.clone` rebinds cloned skeletons, so use it to instance characters.

### 7.5 SDF and voxel characters
- majidmanzarpour/threejs-procedural-animals (**MIT**) [confirmed]:
  - 24 species from SDF primitives with iq's quadratic smooth-min `h = max(k-|a-b|,0)/k; min(a,b) - h*h*k*0.25`.
  - Meshed by Surface Nets with Newton projection, with auto skin weights and seeded `mulberry32`.
  - It proves SDF → mesh → skin works in the browser.
- Verdict [suggested]:
  - Use smooth-min SDFs **only offline, to mesh organic parts** (head, belly), then rigid-skin them.
  - Runtime raymarching would need to write depth and normals to join the outline pass.
  - Voxels read as "voxel art", not t3ssel8r.

---

## 8. Pixel-art readability rules for small characters

- **Slynyrd (Raymond Schlitter), Pixelblog** [confirmed]:
  - Sprite sizes:
    - #22: 16×32 px is a common size; at small sizes the **head is ⅓ to ½ of the sprite**.
    - #17: 8 heads tall is too elongated; use 6; chibi is a tradition.
  - Directions:
    - #22: at least 4 directions, side view mirrored.
    - #55: 8 directions need only 5 drawn if the figure is symmetric; asymmetric designs need all 8.
  - Walk and run cycles:
    - #22: walk 4 frames, run 8.
    - #50: walk 8 frames is optimal, 6 a compromise, 4 key poses only; the head follows a triangle wave.
    - #55: per step the head goes −1, −1, +2 px (bouncy, not a sine); hold idle extremes longer, because even timing
      "felt a bit robotic".
  - Frame timings:
    - #58: run 6 frames × 100 ms; sword attack 100/50/50/50/100/50 ms; 36 unique frames for an 8-dir run.
    - #59 (8×8): outlines are often needed; run at 100/150/100/100/150/100 ms; 2-frame walks are fine for NPCs.
    - #60 (8×16 at 320×180): walk 8 frames; idle and walk 120 ms per frame, run 60 ms; avoids pure-black outlines
      except with NES palettes.
  - Palettes, #1: ramps hue-shift about 20° per step.
- **Pedro Medeiros (Saint11)**, https://saint11.art/blog/pixel-art-tutorials/ [confirmed]:
  - Walk: 12 frames (6 per leg) for fluid motion, or **6 (3 per leg) at low resolution**. Poses: contact, down,
    down+ (lowest point), prepare-passing (head delay), passing, up. Arms swing opposite to the legs.
  - Top-down: 3 frames mirrored; walking up bobs less.
  - Idle: **2-frame bouncy idle** (down 1 px with knees bent, then up 1 px). A 3rd frame delays the face; 6 frames
    allow hair lag. Move the face after the silhouette.
  - Outlines:
    - avoid them at very low resolution if you can;
    - otherwise use a **dark colour, not black**, and selective outlining (none on lit edges);
    - internal lines lighter than the outer line.
  - Silhouette first. Cuteness: < 4 heads, big head, small limbs, triangular body, dark shiny eyes, more squash.
  - Sub-pixel motion: move the interior before the silhouette, or move light rather than shapes.
- **Scale reference:** Owlboy renders at 640×360 with Otus 39 px tall [community].
  - pixel3d's `docs/CHARACTERS.md` target is 1.25 m at 36 px/m: **45 px vertical world size, ≈ 39 px on screen**
    after the 30° pitch foreshortening (`h·cos 30°`).
- **Not found** from these authors: an explicit "1 px eyes" rule or an explicit "3–4 shades per material" rule.
  Treat both as [suggested] conventions, not sourced rules.

---

## 9. Recommended technical approach for agent-authored characters in three.js [suggested unless tagged]

### 9.1 Modelling: primitives, rigidly skinned
- Characters are assembled **in code from low-poly primitives**: chamfered boxes, frustums, prisms, wedges, low hulls.
  Each part is weighted 100 % to one bone and merged into **one SkinnedMesh** with vertex-colour tones.
  - Why: deterministic, cheap (1 draw call plus shadow), and flat faces give clean toon bands and outline edges.
    t3ssel8r: "simple, low-fidelity" models [confirmed, Cascadeur interview]; Holland: "Low poly models with clearly
    defined outer edges suit best" [confirmed].
  - No blended weights at joints. At 40 px, joint creases are invisible and blends just smear normals.
  - Overlap parts at joints (sleeve over forearm) to hide gaps at bend angles up to about 90°.
- **Not** smooth subdivided meshes or painted textures. Robert-K's fox (1024² painted maps, about 870 verts, smooth
  normals) had to have its outlines turned off (§1.3).
- Optional organic parts: an offline SDF smooth-min → Surface-Nets mesh (§7.5), then decimated.
- Shading control as data (GG Xrd, §6.2):
  - a per-part `cutMod` shadow bias;
  - per-part normal override (e.g. sphere normals on the head box, so the face gets one clean terminator);
  - per-pose bone **scale** for squash and stretch and cheats.

### 9.2 Rigging
- A fixed named skeleton per archetype (biped, quadruped, blob, snake) built from metres-and-names specs. Rest =
  zero rotations. Poses are given in a semantic convention (fwd, twist, out); `docs/CHARACTERS.md` §1 already defines
  one.
- Extra chains for secondary motion: tail, ears, cape, scarf, antennae. Each is 2–4 bones driven by SOD (§3.5).
- Sockets (empty bones) for weapons and props.

### 9.3 Rendering crisply: snap the root, step the pose, quantise the facing
1. **Root position:** snap to the texel grid **every frame** with `camera.snapObjectToTexel(root)`, restored after the
   render. This is Holland and Robert-K's snap group [confirmed]. Between pose frames the whole sprite then moves by
   whole texels, with no internal shimmer.
2. **Pose:** evaluate bones only on pose-frame boundaries:
   `tq = floor(t·fps)/fps` (Robert-K, fps 12; aarthificial 10; DOGWALK 12 / 8). Keep the bones unchanged between
   boundaries.
   - **Never snap individual vertices or bones.** Holland: throttle skinned animation instead of snapping it
     [community].
3. **Facing:** quantise yaw about world +Y **relative to camera yaw**, to 8 steps, with about 10° hysteresis
   (DOGWALK's ValueSlicer). Change facing only on pose frames, at most one 45° step per pose frame.
   - Do not use three.js's camera-space Euler snap: it tilts the model under a pitched camera (§5.1).
4. **Clip switches** happen on a pose-frame boundary (aarthificial). Actions may start on the next boundary, which is
   ≤ 83 ms of latency.
5. **Root motion stays continuous** (snapped) while the pose steps. This matches t3ssel8r's importer, where only
   RootT.xz is smooth [confirmed].
   - Accepted cost: a planted foot slides up to `v/fps` between pose frames (walk 1.0 m/s at 12 fps is 8 cm, about
     3 px).
   - The alternative, moving the root only on pose frames, is the "retro" look with choppy travel. Make it a per-game
     option, not the default.
6. **Outlines:** characters are FLAG_FULL (silhouette plus convex edges), using the world's pipeline. Tiny accessories
   (< 3 texels) use FLAG_DEPTH_ONLY so they don't speckle.
   - Expect the bababuyyy "crease at object bases" where feet meet grass, because grass writes no depth [confirmed
     for their pipeline].
   - Saint11's selective outline (none on lit edges) is approximated by pixel3d's tinted line and rim highlight.
7. **No screen-space dithering** on characters (§5.4). Keep emissive and flash effects quantised (three.js example:
   6 levels).

### 9.4 Animating: keyed poses on twos + procedural layers, all sampled on the pose clock
- **Keyed clips:** pose-to-pose with **holds, not in-betweens**.
  - Dead Cells: extra frames "never in-between" [confirmed]. GG Xrd: "No interpolation" [confirmed]. t3ssel8r: twos,
    plus a single smear frame for big motions [confirmed].
  - Agents write 2–8 key poses per clip. For cycles, eased in-betweens may be *generated* but are still **sampled at
    the pose fps**.
  - Big arcs use **one smear frame**: a procedural swept mesh, cubic Bézier of socket position plus slerped
    orientation, handles along the blade axis (t3ssel8r [confirmed]).
- **Locomotion:**
  - Drive the cycle phase by **distance** (stride wheel, §7.2) and **quantise the phase**, not time:
    `pq = floor(p·N)/N`, where N = frames per cycle.
  - At the design speed this gives exactly fps poses per second. Slower walking holds frames longer, faster walking
    skips none. The walk shows the *same N drawings* every cycle, like a sprite sheet.
  - Choose N first, then the stride: `S = v_design · N / fps`.
- **Procedural layers:**
  - SOD for lean, head look, tails and ears, cape chains, squash.
  - Two-bone IK for feet on uneven ground or for hand targets.
  - Look-at for the head.

  All are integrated at a fixed step (1/60 s, or iggigabriel's 1/100 with fraction) from t = 0, and **read out only
  at pose-frame boundaries**. Otherwise a 60 Hz spring reintroduces sub-texel smooth motion: the "3D game" look the
  GG Xrd team explicitly killed.
- **Idle:** 2–4 frames, with 1-texel bob extremes held longer than the in-betweens (Slynyrd #55, Saint11).
  Optional blink as a 1-frame eyelid swap.

### 9.5 Determinism and evaluation order per frame
1. `t → path(t)` gives the logical position and velocity.
2. Fixed-step SOD and phase integration up to `t`.
3. If `floor(t·fps)` changed, compute the pose: clip keys at `tq` + locomotion at `pq` + IK + SOD readouts →
   bone quaternions. Otherwise keep the bones.
4. Root position → `snapObjectToTexel`.
5. Facing (quantised, hysteresis, pose-frame-gated).

Re-simulate from 0 when `t` jumps backwards or by more than about 1 s (shot.sh renders arbitrary `--times`).

### 9.6 Baking 8-direction sprite sheets for 2D games
- Same rig, same toon and outline pipeline, rendered with the **character at the origin and the root locked**
  (in-place clips). Per-frame root deltas go to JSON (t3ssel8r keeps root XZ separate [confirmed]).
- Camera: ortho with the game's pitch (30° gives 2:1 lines) and an **integer px/m** (36 at 1.25 m gives 39 px).
  Yaw = k·45° (k = 0..7) around the character. Cell size = max bounding box over all frames and directions plus 2 px,
  with a fixed **feet anchor** pixel.
- Lighting: the sun is fixed **relative to the camera** for every direction, so all 8 directions are lit the same way,
  as in a hand-drawn sheet. Optionally export the **normal pass** (`rtNormal`) as a second sheet for runtime
  relighting (Dead Cells exports a normal map per frame [confirmed]).
- Frames: every pose frame of each clip at its fps. Holds are emitted as duration metadata, not duplicate cells
  (t3ssel8r removes duplicate keys [confirmed]).
- Mirroring: only for symmetric designs. Bake 5 directions and mirror 3 (Slynyrd #55 [confirmed]). Asymmetric
  characters (a weapon in one hand) need all 8.
- Background: alpha from the "background = 0" flag, no AA, nearest only. Run the palette check per cell: colours per
  slot ≤ 3 tones + line + rim.

---

## 10. Parameter starting values [suggested; sources in brackets]

| parameter | start | range / note |
|---|---|---|
| pose fps | **12** | 8–12. [Robert-K 12, DOGWALK 12/8, aarthificial 10, t3ssel8r twos] |
| character height | 1.0–1.3 m → 31–41 px on screen at vh 10 | [Dead Cells 50 px, Owlboy 39 px at 640×360] |
| head / total height | **⅓** (chibi 2.5–3.5 heads) | [Slynyrd ⅓–½, Saint11 < 4 heads for cute] |
| min feature thickness | **2 texels** (0.055 m at 36 px/m). Limbs ≥ 0.07 m | eyes: 1×2-texel dark boxes or vertex-colour patches [suggested] |
| walk cycle | **8 frames** at 12 fps (0.67 s), or 6 | [Slynyrd #50: 8 optimal, 6 compromise. Saint11: 6 at low res] |
| run cycle | 6 frames, 1 frame per 100 ms (about 10 fps) | [Slynyrd #58] |
| idle | 2–4 frames, extremes held 2× | [Saint11, Slynyrd #55] |
| attack | anticipation 2–3 frames, smear 1, contact 1, follow-through 2–4 | [Slynyrd #58 timing ratio 2:1:1:1:2:1, t3ssel8r single smear] |
| design walk speed | 1.0 m/s for a 0.42 m leg (Fr ≈ 0.24); run about 2.2 m/s (Fr ≈ 1.2) | [Froude, §7.3] |
| stride S (2 steps) | `v·N/fps` = 1.0·8/12 ≈ **0.67 m** | ≈ 2.3·leg·Fr^0.3 = 0.63 m [Alexander, unverified constants] |
| duty β | 0.6 walk, 0.35 run | [gait 60/40] |
| step lift h | 0.25·leg (exaggerated) | at least 2 texels so the lift reads |
| bob | **1 texel** (0.03 m) on contact/down frames, 2 per cycle | [Slynyrd head −1, −1, +2. Real bob < 1 px at this scale] |
| lateral sway | ½ texel → usually 0, use only on runs | [human 5 cm ≈ 2 px at full scale; chibi less] |
| facing | 8 directions, 10° hysteresis, ≤ 1 step per pose frame | [DOGWALK 16 + slicers; Slynyrd 8 / 5 drawn] |
| SOD | §3.5 table | [iggigabriel presets] |
| lean from acceleration | 3° per m/s of (velocity − 0.2 s-filtered velocity), cap 12° | [Andicraft 3°; cap is ours] |
| colours | ≤ 5 slots × 3 tones + accent; shadows hue-shifted cool | [CHARACTERS.md §1; Slynyrd hue-shift ramps] |

---

## 11. Cross-check against `docs/CHARACTERS.md` (draft by the lead)

Consistent with the research:
- 12 fps poses.
- Root snapped, not the bones.
- 8-way facing.
- One SkinnedMesh with rigid parts.
- SOD with the stable k2 clamp.
- Fixed-step determinism.
- Smear via cubic Bézier.
- 39 px for 1.25 m.

Suggested amendments (CONTRACT-REQUEST material for the lead):
1. **Foot-slide claim.** §5 says locomotion has "no foot sliding". With a continuous root and a stepped pose, planted
   feet slide up to `v/fps` between pose frames (§9.3 item 5). Either document that as accepted (t3ssel8r and every
   sprite game do this) or quantise the phase *and* move the root only on phase changes as an option.
2. **Quantise the locomotion phase, not just time** (`pq = floor(p·N)/N`). Otherwise walk drawings drift from cycle to
   cycle whenever the cycle length is not a whole number of pose frames.
3. **`SecondOrderQuat`:**
   - Sign-align the stored previous input too (the Andicraft pitfall, §3.3), and renormalise the output.
   - Prefer angle or up-vector variants (iggigabriel HexTile) where possible.
   - Use clamp A, not clamp B.
4. **SOD readout on the pose clock**, not per display frame.
5. **Facing quantisation:** about world Y, relative to camera yaw, with hysteresis. Change it on pose frames only.
6. **Clip switches** on pose-frame boundaries (aarthificial).
7. `frustumCulled = false` on character meshes (r170 bounding-sphere caching).
8. Don't use `AnimationMixer` for playback (`setTime` is not fully history-free, §7.4).

---

## 12. Pitfalls

1. **Smooth sub-texel limb motion** (SOD, IK or interpolation evaluated at 60 Hz) reads as "3D game". Everything that
   moves bones must be read out on the pose clock.
2. **Snapping vertices or bones** collapses or jitters geometry. Snap the root only.
3. **Camera-space Euler rotation snapping** (three.js example) tilts characters under a pitched camera.
4. **Painted high-resolution textures and smooth normals** cause outline speckle and noisy bands (Robert-K had to
   disable character outlines).
5. **Features under 2 texels** flicker or vanish between frames and directions. Dead Cells never solved edge flicker
   either.
6. **Mid-frame clip switches** produce short frames and stutter (aarthificial).
7. **Cycle length vs pose fps beating:** sampling a distance-driven cycle by time produces different drawings each
   cycle.
8. **Quaternion SOD:**
   - component-wise without a sign fix spins the long way;
   - sign-fixing the target but not the stored previous input spikes the k3 term;
   - Overmind-style init (`yd = x0`) launches the value at start.
9. **Clamp B** (`1.1·(T²/4 + T·k1/2)`) is stable but can ring at the step rate. Use clamp A.
10. **SOD with variable dt and no substeps** isn't reproducible across `--times` renders. Use a fixed step plus
    re-simulation.
11. **`AnimationMixer`** state (`_loopCount`, LoopOnce disable, fades) breaks pure-of-t evaluation.
12. **SkinnedMesh culling** uses a bounding sphere cached once, so animated poses get culled at screen edges.
13. **Shadow-map texels are world-anchored, but the character moves in screen texels.** Its cast-shadow edge and any
    self-shadow can crawl as it walks. Mitigations: a low self-shadow contribution (`cutMod` bias), or disable
    `receiveShadow` on small parts [suggested; untested].
14. **Feet in grass:** grass writes no depth, so outline creases appear at the base (bababuyyy). It may also hide the
    feet entirely at 30° pitch. Check in-scene shots, not only the plain stage.
15. **Screen-anchored dither** (Bayer on `gl_FragCoord`) swims on moving characters.
16. **Asymmetric designs mirrored in bakes** move the weapon to the wrong hand. Bake all 8 directions for asymmetric
    characters.
17. **Per-direction swing arcs** fail. Prefer wide, flat arcs that read from any of the 8 views (t3ssel8r).
18. **Licences:**
    - Andicraft gist, Overmind, t3ssel8r gist, Kody King, SpiderProceduralAnimation and Holden's page carry no licence.
      Re-derive from them, don't copy.
    - Unity Animation Rigging is Unity-only.
    - MIT sources (iggigabriel, Robert-K code, three.js, threejs-procedural-spider and -animals) and CC0 Holland code
      are copyable with attribution.
    - Robert-K's fox asset has unknown provenance.

---

## 13. Gaps

- No primary text for Rosen's GDC 2014 talk or Rain World's GDC 2016 talk (both paywalled). Stride-wheel details
  come from forum summaries.
- t3ssel8r's actual character model, rig and clip frame counts are not public (only the importer and the video). His
  pose fps is "twos", but whether that means twos of 24 (12 fps) or of 30 is not stated.
- No sourced rule for "1 px eyes" or "N shades per material". The values here are conventions.
- How t3ssel8r or Holland handle a character's **cast shadow** under snapping is undocumented. Pitfall 13 is
  theoretical until tested in `shots/`.
- Hysteresis width for 8-way facing is DOGWALK's concept, but their numbers are not given. 10° is a guess.
- Reddit r/godot and r/Unity3D threads on "3D pixel art character" techniques were unreachable (403). Robert-K's demo
  is the only community character implementation actually read.
- The SOD pole-zero-matching branch is confirmed only via third-party ports (shape consistent with the video), not
  from t3ssel8r's own code (none published).
