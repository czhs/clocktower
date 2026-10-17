# t3ssel8r: characters and animation (what he has shown and said), for an agent-authored character pipeline

Research date: 2026-10-15. Companion to `research/02-t3ssel8r.md` (rendering). This file covers only **characters,
rigging, animation, smears, procedural motion and character-specific rendering tricks**.

Confidence labels (same as 02):
- **[confirmed]**: t3ssel8r said or wrote it himself (video transcript, on-screen code/inspector, YouTube reply,
  Reddit, tweet, Patreon), or I **measured** it directly from his published pixels (marked *[measured]*).
- **[community]**: other people's reconstructions.
- **[suggested]**: my inference or a starting value to tune.

Quotes are verbatim (YouTube auto/creator captions, comment text, tweet text, Patreon text). Nothing is paraphrased
inside quotation marks.

---

## 0. Sources pulled (all fetched and read)

| Source | How | What it gave |
|---|---|---|
| "Making an Animation for my 3D Pixel Art Game" `1FrIBkuq0ZI` (2021-06-12, 7:20) | yt-dlp: creator captions, description, 884 comments, 1080p60 video for frames | Whole workflow: references, Cascadeur, keyframe thinning, import script, smear algorithm |
| "Giving Personality to Procedural Animations using Math" `KPoeNZZ6H4s` (2022-06-29, 15:29) | yt-dlp: captions, 2755 comments, 1080p video; on-screen code read from frames at 8:54, 13:10, 14:13 | f/ζ/r second-order system, all three code versions, robot parameters from the Unity inspector |
| Patreon "Procedural Animation Video Notes" (2023-05-04, public) | `https://www.patreon.com/api/posts/82487305` (JSON, `content_json_string`) | Transfer function, r derivation, quaternion dynamics, implicit Euler (what he uses now), pole matching |
| Patreon "Thoughts on 3D->2D Cameras" (2023-06-21) | same API | **Paywalled**: only the teaser "There is a germ of a video idea here which has been difficult to distill into an actual script…" and a blurred image. Other locked posts: "State machines and emergent behavior", "Making progress", "Designing dialogue from the ground up". Only 2 of 7 posts are public (the other public one is the Pixel-Art-AA notes already in 02). |
| Gist "PixelAnimationImporter" https://gist.github.com/t3ssel8r/aba0b33369ea620a63917f4ac21fd585 | raw download, read in full (C#, 281 lines) | Exact import rules (§3) |
| Reddit, all 55 comments + 6 posts | Arctic Shift API (`/api/comments/search?author=t3ssel8r`, under 100 so no paging) | 3D models vs sprites, quaternion trick |
| Twitter/X: **306 of his tweets** | Wayback CDX listing of `twitter.com/t3ssel8r/status/*` (325 IDs) → each fetched from `cdn.syndication.twimg.com/tweet-result?id=…`; one deleted tweet read from the Wayback copy | Character shader tricks, smear Bézier identity, A/B movement-cadence opinion, rope trick, cheat-perspective skew, gameplay clips |
| Also: `39A0n24PX8g` (forest, "preliminary character work, and a dithered see-through shader"), `yGci-Lb87zs` (aim assist), `AcVDCCNqvzg`, `erQ8PvxIjS8` (fire), `cCUCMBmc9yQ` (parallax) | descriptions, captions, comments; 1080p video for 39A0 | Character in the forest, palette-matching replies |
| Channel listing `@t3ssel8r/videos` | `yt-dlp --flat-playlist` | 28 videos, no shorts/streams tab, nothing newer than d6tp43wZqps (2023-05). The latest character footage is on Twitter (2022-05 gameplay, 2023-12 dialogue). |

Reference frames saved to `refs/chars/` (gitignored, private viewing only), described in §7.

---

## 1. The workflow in one picture [confirmed unless marked]

```
Blender: low-poly humanoid, rigged with Rigify (made by a teammate, not public)
   │  FBX
Cascadeur: block key poses with auto-posing (hands/feet/body) → interpolate → keep only chosen frames
           as keyframes (≈ "on twos") → NO in-betweens in the middle of a swing → secondary motion on cape
   │  FBX export
Unity "Import Pixel Animation" editor script (gist): keys snapped to the clip frame grid, duplicate keys
   deleted, ALL bone curves set to Constant (stepped) tangents, root XZ motion kept smooth (ClampedAuto),
   compression off, no resampling, Humanoid avatar copied, non-loop clips get a hold key 1 frame after the end
   │
Animator state machine (transition timings tuned by hand)
   │
Runtime: sword script measures per-frame motion → if large AND along the attack direction, builds a smear
   mesh from a Bézier-like interpolation of position + orientation between last and current frame; the smear
   lives a few frames, getting streakier, then disappears
   │
Render: same 640x360 toon pipeline as the world, character root snapped to the texel grid in camera space,
   far half of the body forced into shadow (limb readability), optional rotate+skew toward the camera
```

Timing: "the animation itself took around 90 minutes total to turn around" (video); "about 90 minutes in-program.
a few days testing and integrating" (YouTube reply).

---

## 2. Modeling and rigging

### Facts [confirmed]
- Not made by him: "it was made by a colleague using blender and rigged with rigify"; "the character was modeled
  and rigged in blender (not by me)"; "my team made it. sorry, it's not public."
- Nothing special about the mesh: "I don't think this was modeled with any particularly special workflow. It's just
  a regular low-poly character model."
- Standard rig: "it's just a regular humanoid rig. The curve being controlled is the root motion translation." (tweet
  2021-06-17). The importer uses `ModelImporterAnimationType.Human` with `avatarSetup = CopyFromOther`, i.e. Unity
  Humanoid retargeting, so any humanoid clip fits: "some of the animations are taken from the @ExplosiveLLC animation
  asset pack for quick prototyping. This is one of the big advantages of making the game in 3D." (tweet 2021-08-24).
  Video description: "it allows the player model and weapon models to be swapped very easily."
- How the pixel look happens on the character: "it's mostly just rendering at a low resolution with a toon shader and
  no anti aliasing"; "it's just a toon shader on a low resolution camera. the character is snapped to the nearest pixel
  to avoid pixel creep."
- Early on (Reddit, 2021-01-24), asked about hand-drawn sprites vs pixelated 3D models: "will try to do 3D models. I've
  had some success with initial tests. the main limitation seems to be with single-pixel details and smears, but those
  are planned features."
- **No poly count, proportions sheet or texture size has ever been published.** (Gap, §9.)

### What the mesh looks like [measured from the Cascadeur screenshots in 1FrIBkuq0ZI, 2:00–6:50, and in-game frames]
- Faceted low-poly, flat-shaded, clothes modelled as separate shells: short **hooded capelet/cape** over a tunic,
  short skirt/shorts, bare knees, tall boots, gloves. Hair is a chunky helmet-like bob with a small **top tuft**,
  plus **pointed elf ears**. The cape is rigged with extra bones (he adds "secondary motion on the cape" by keying it).
- Colours are flat per material (vertex colour or tiny albedo); no painted texture detail is visible at game scale.

---

## 3. Keyframe animation for a pixel look

### 3.1 What he said [confirmed]
- Reference study: Hyper Light Drifter swings are "mostly vertical swings" facing left/right and "more horizontal when
  facing up or down", which is fine in 2D but would mean "changing the animation entirely depending on the direction the
  character is facing relative to the camera". BotW's sword arc "is much more flat… The flat, wide arc helps it read well
  no matter which way the player is facing." → **"making sure that the swing is wide and flat, to ensure that it reads
  well from different viewing angles."** He disliked how Link "digs in his heels, which doesn't feel dynamic".
- Blocking: "capture the key poses in the animation, such as the anticipation before the swing, and the recovery after
  the swing." Cascadeur auto-posing lets him "focus on the movement of just the hands, feet, and body".
- **Thinning to "twos"**: "I use the built-in interpolation functions to fill in the in-between poses. I then convert some
  of the interpolated frames into keyframes, and delete the rest. For smaller motions, this emulates the effect of animating
  on twos, and prevents the animation from looking too smooth."
- **One-frame smear, no in-betweens**: "An important part of the pixel art animation style is to represent the bulk of the
  motion in a single frame smear, without any in-betweens. I will be adding the smear programmatically in engine, so I make
  sure to just not add any interpolation frames mid-swing here."
- Second pass: stronger poses, "a few frames depicting follow-through momentum from the body after the swing, which I think
  will help sell the weight of the attack"; second hit changed "into more of a lunge"; "secondary motion on the cape"; clean
  up auto-posing errors on "the raw joints"; added "a return-to-idle animation for the first hit of the combo".
- Preview trick: "Here again I am enabling interpolation in order to preview the motion and ensure I have the momentum
  right. When I have it how I like it, I will pick the important frames to keep, and convert them into keyframes as before."
  On Twitter: "it's 3d rig animation anyways so adding more frames is as easy as enabling interpolation :D".
- Self-critique accepted from viewers: "the legs are bent at angles which do not support the body properly through the
  movement"; "the foot placement and leg location can definitely be improved."
- Why Cascadeur over Blender: "auto-posing (posing only a few control points and letting the program figure out natural
  positions for the other joints) and auto-physics (correcting your animation for physically-accurate ballistic motions)…
  All joints are interchangeably FK/IK… The interpolation options also let you interpolate in either joint-space or
  world-space".
- Return to idle keeps position: "it's just fiddling with the state transition timings in the animation state machine".

### 3.2 The import script (gist), line by line [confirmed: read the code]
Menu `Assets/Import Pixel Animation`, per clip options: Export, Destination clip, **Use Root Motion** (default true),
**Smooth Root Motion** (default true), Loop.
1. Import settings: `animationCompression = Off`, `resampleCurves = false` (keeps Cascadeur's exact key times, no 60 Hz
   resample), Humanoid avatar copied from a reference avatar. On first import: `lockRootRotation = true`,
   `lockRootHeightY = true`, `keepOriginalOrientation/PositionY/PositionXZ = true`; `lockRootPositionXZ = !useRootMotion`.
2. For every curve binding of the imported clip:
   - Custom (user) curves: only **round key times to the clip frame grid**: `t = round(t·frameRate)/frameRate`.
   - Delete **duplicate keys**: a key is removed when its value `≈` the previous key's value (keeps the last one of a held run).
     For smooth root curves it keeps a key if the previous one was deleted and the next differs (so a hold followed by motion
     still has a start point).
   - Tangents: root `RootT.x` / `RootT.z` with smoothRootMotion → `ClampedAuto` (smooth). **Everything else → `Constant`**
     on both sides (stepped: the pose holds until the next key).
   - Non-looping clips: stepped curves get an extra copy of the last key at `+1/frameRate` (so the final pose is held for one
     frame instead of being a zero-length key); smooth root curves are shifted later by one frame.
3. Animation **events** are snapped to the frame grid too. Clip is written as `.anim`.
He: "it's really just automating what I was doing by hand, which is change some import settings and tweak the keyframes a bit."

What this means: **pose = step function, body travel = smooth**. The duplicate-key removal is what turns Cascadeur's
baked every-frame export back into "only the frames I kept".

### 3.3 Stepped poses vs smooth travel (his A/B question) [confirmed]
- 2021-05-18 tweet: "With low-framerate moving animations, do you choose to move the object at high framerate, or at the
  animation framerate? What about if the camera is tracking the object vs not?" Next day he posted an A/B video (saved
  frames show the Unity root-motion curve smooth in one half and a staircase in the other).
- His conclusion (2021-11-14): **"slow moving actions look most "authentic" in option A [move at animation framerate], but
  that larger motions and gameplay dynamics play a lot better in option B [smooth movement]. Setting up the asset pipeline to
  make this distinction requires some unfortunately custom tooling."** and "Another good reason for B… is that it enables
  sub-"pixel" camera movements, which are really nice, but completely incompatible with A."
- Perception trick (2021-11-30): "the model can move with more inertia if the smear is snappy and the overall motion can still
  sell even though the timing doesn't align. Check out link's spin attack in botw".
- Diagonal stair-casing: "I haven't found this to be an issue at the resolution I run at (640x360)".
- Pixel creep: "I struggle with pixel creep all the time lol. I haven't found a very good way to handle it yet. it's all hacks
  on top of hacks."; "the shimmer can be removed by snapping the object origin to the nearest screen "pixel""; "you have to
  perform the rounding in the camera's coordinate system if the camera is rotated relative to the world." (2022-01-30)

### 3.4 Frame rate [measured, low confidence]
- His exact clip frame rate is never stated. Cascadeur's default scene rate is 30 fps [community knowledge, unverified here];
  the gist only uses `anim.frameRate`.
- In the 60 fps capture of the animation video the character region changes in an alternating big/small pattern
  (e.g. 54k, 16k, 54k, 11k changed pixels on consecutive frames), and the smear holds each state for 2 video frames:
  consistent with **game/animation updates at 30 Hz**. He also wrote about his procedural dynamics: "actually I just put in
  fixed update without interpolation because my game is ok with choppy animations."
- Held poses then last 2+ updates ("on twos" ≈ 15 pose changes/s for small motions; the swing itself is 1 smear frame).

---

## 4. Smears (procedural, attached to the weapon)

### 4.1 What he said [confirmed]
- "The sword object in my game has a script that runs on every frame and measures the change in motion from the previous frame.
  If the motion is large, and along the blade's attack direction, it generates a smear mesh that tracks the blade for a few
  frames, with a texture that becomes streakier as the smear animates out."
- "The smear is generated by cubic Bezier interpolation on both the position and orientation of the sword."
- "My sword model is oriented such that the blue axis points outward, and the red axis points toward the cutting edge. In a
  purely rotational swing, I expect all translational motion of the sword to occur tangential to the red axis, and all the
  rotational motion of the sword to occur around the green axis. To enforce these boundary conditions, I generate the Bezier
  handles such that the position handles line up with the red axes, and the rotation handles line up with the green axes.
  The handle lengths are set in order to best approximate a circular arc."
  (Unity axes: blue = +Z = blade direction hilt→tip; red = +X = toward the cutting edge; green = +Y = swing axis.)
- Deleted tweet (2021-06-02, Wayback copy): "Hm.. weird accidental discovery: the cubic Bézier interpolation between objects
  (a, b, c, d) at time t is exactly equal to lerp(lerp(a, b, t), lerp(c, d, t), smoothstep(0, 1, t))". Thread: "as long as you
  define an interpolation function for any arbitrary (not necessarily linear) object, you can "Bézier interpolate" them with only
  3 interpolations, rather than 6." "For example, it can be used with Quaternion.Slerp to have nice interpolation of rotations
  with a prescribed tangential angular velocity at the start and end." "(application: creating the shape of a motion smear given
  only the position and orientation of the object at the beginning and end frame)" + a wireframe image (`refs/chars/04_…`).
- "the smear never needs to be drawn until the final frame is already displaying. it's a glorified trail renderer."
  (i.e. it is built from the previous and the current pose, after the swing frame has happened.)
- Hit detection is not tied to it: "not implemented yet lol."

**Check of the identity [measured by me, numerically]:** `lerp(lerp(a,b,t), lerp(c,d,t), smoothstep(t))` is **not** literally
the cubic Bézier of control points a,b,c,d (for 1-D points 0,1,2,3 the two differ by up to 0.19; the lerp form is quartic unless
b−a = d−c). What it *does* guarantee: passes through a at t=0 and d at t=1, with end velocities exactly (b−a) and (d−c) per unit t.
That is all a smear needs ("prescribed tangential velocity at the start and end"), and it works for anything with a lerp/slerp.

### 4.2 Smear shape, from his wireframe [measured, refs/chars/04]
A **fan-shaped ribbon**: N ≈ 20–24 segments, each segment is the blade line (inner point near the hilt/guard, outer point at the
tip) at one sample t of the interpolated pose; consecutive blade lines are joined into quads. Inner radius ≈ 1/3 of outer, i.e. the
smear covers the blade, not the arm. The arc in that image spans ≈ 270°.

### 4.3 Smear look in game [measured, 1FrIBkuq0ZI 0:11–0:25 at 60 fps; refs/chars/03, 03b]
- Opaque, **flat, unlit, cool light grey**, two tones: body ≈ `#acb8b8`, lighter band ≈ `#bcc4c4` (video-compressed values).
  Darker than the white hair (`#f0f0f0`). **No outline, no dark edge.** Hard pixel edges.
- Thick: up to ≈ 8–12 texels across, arcs ≈ 35–60 texels long at the character scale in §7.
- It occludes and is occluded in 3D (partly behind the cape / in front of the legs) → depth-tested mesh.
- Lifetime ≈ **6–8 video frames at 60 fps ≈ 0.10–0.13 s** (measured over 19 swings), stepped in pairs (30 Hz):
  frame 1–2 full crescent → 3–4 thinner (eaten from the trailing end and the inner edge) → 5–6 broken into thin
  horizontal-ish **streaks** (dry-brush) → a few 1-px streak remnants near the blade → gone.
- Works unchanged when the weapon is swapped (2021-06-14 "that's not a knife..." GIF: a greatsword gets a wider smear).

---

## 5. Procedural animation: the f, ζ, r second-order system

### 5.1 Model [confirmed: on-screen equations, captions, Patreon]
Equation of motion (x = input from the game, y = animated output):

```
y + k1·ẏ + k2·ÿ = x + k3·ẋ
f = 1 / (2π·√k2)        ζ = k1 / (2·√k2)        r = 2·k3 / k1
⇔ k1 = ζ/(π f)          k2 = 1/(2π f)²          k3 = r·ζ/(2π f)
```
- f: natural frequency in Hz, "the speed at which the system will respond… does not affect the shape of the resulting motion".
- ζ: damping. 0 = never settles; 0<ζ<1 underdamped (vibrates); >1 no vibration, slow settle. "The SmoothDamp function in Unity uses
  a zeta equal to exactly 1".
- r: initial response. "When r is 0, the system takes time to begin accelerating from rest… When r is greater than 1, the system will
  overshoot the target… When r is negative, the system will anticipate the motion… When modeling a mechanical connection, a value of 2
  for r is typical". Anticipation "works… like a time delay."
- Transfer function (Patreon): `(r ωn ζ s + ωn²) / (s² + 2ζ ωn s + ωn²)`, ωn = 2πf. Initial speed `ẏ0 = rζ/ωn`, so changing f does
  not change the shape. ζ=1, r=1 collapses to `ωn/(s+ωn)`, a first-order exponential smoother.
- y = x exactly ⇔ f = ∞ (k1=k2=k3=0, needs a special case). SmoothDamp(smoothTime) ≈ f = 1/(π·smoothTime), ζ=1, r=0 (viewer's
  derivation, he agreed "I think you meant r=0 but otherwise yes").
- Works on anything with + and scalar ×: "float, Vector3, Quaternion, etc".

### 5.2 What he applies it to (the spider-bot) [confirmed]
"this little robot character which moves its body and legs using inverse kinematics in response to realtime requests to move and change
orientation". Values:
- Body position: "underdamped movement for the body with zeta of 0.5, and r of -2 to give it some anticipation before fast movements";
  inspector: **Movement Response Frequency 2, Damping 0.5, Undershoot 2** (→ f=2 Hz, ζ=0.5, r=−2).
- "I tilt the body towards the target position" (inspector **Movement Tilt Factor 30, Movement Tilt Max 10**).
- Body orientation: "zeta of 1 and r of 0". Head orientation: same "but with a smaller f, to make it lag behind the body as a sort of
  secondary motion" (exact f not shown). Reply: "the head tracks the player quickly. it's just the head's response to the body itself
  turning that's a bit slower."
- Other inspector fields (SpiderIKController, 2022): Neck Extension 1, Crouch Factor 0, Crouch Span Factor 3, Constraint Radius Min 0.1 /
  Max 0.25 / Max Speed 4, **Lift Height 0.1, Leg Speed Factor 3, Leg Min Speed 4**, Speed Smoothing Time 0.1, Head Offset 0.274, Standing
  Height 0.312. Legs are rigidbodies on an Articulation Body root ("Main links are using articulation bodies, and constrained to rigidbodies
  using joints to create the IK handles." 2021-12-09). Gait tip: "lifting the set of legs that's furthest away from the target zone".
- Cables: "a quadratic Bezier curve whose middle handle (gray dot) is attached to a spring/damper to a fixed point (red dot) some distance
  below the midpoint of the two ends depending on the amount of slack in the rope. If the slack is negative, the spring constant is
  increased for a nice tightening/vibrating effect." (2021-12-12)
- Game design use: "characters could move with different parameters depending on their state of awareness, health, status effects".
- Opinion: procedural "makes it easier to handle dynamic movement situations, but harder to express personality in motion." (2022-05-08)
- Other physical tricks: a rigidbody that lands facing the ground normal via "just some PD control" → "didn't want to create a get-up
  animation. don't need to get up if you never fall down" (2022-10-18).
- The player character (humanoid) is keyframed; **no procedural walk/IK for the humanoid has been shown.**

### 5.3 Integrators, verbatim from his on-screen code [confirmed]
v1 (8:54), semi-implicit Euler, position first:
```
xd = (x - xp) / T; xp = x;            // if input velocity unknown
y  = y + T * yd;
yd = yd + T * (x + k3*xd - y - k1*yd) / k2;
```
v2 (13:10): `T_crit = 0.8f * (Sqrt(4*k2 + k1*k1) - k1)` ("multiply by 0.8 to be safe"); `iterations = Ceil(T/T_crit)`, substep.
v3 (14:13), what he ships (k1_stable belongs in the last line; he confirmed the typo):
```
_w = 2*PI*f; _z = z; _d = _w * Sqrt(Abs(z*z - 1));
if (_w * T < _z) {                    // clamp k2: stable AND no jitter
    k1_stable = k1;
    k2_stable = Max(k2, T*T/2 + T*k1/2, T*k1);
} else {                              // pole matching when the system is very fast
    t1 = Exp(-_z * _w * T);
    alpha = 2 * t1 * (_z <= 1 ? Cos(T * _d) : Cosh(T * _d));
    beta = t1 * t1;
    t2 = T / (1 + beta - alpha);
    k1_stable = (1 - beta) * t2;
    k2_stable = T * t2;
}
y  = y + T * yd;
yd = yd + T * (x + k3*xd - y - k1_stable*yd) / k2_stable;
```
Stability analysis: state matrix `A = [[1, T], [-T/k2, (k2 - T² - T k1)/k2]]`; eigenvalues must have |z|<1; gives `T < √(4k2 + k1²) − k1`.
`T·k1` bound in the clamp removes negative eigenvalues ("frame-to-frame jittering… is caused by negative eigenvalues").

### 5.4 His updated integrator (Patreon, 2023) [confirmed]
Fully implicit Euler on velocity, unconditionally stable:
```
y[n+1]  = y[n] + T·ẏ[n]
ẏ[n+1]  = (k2·ẏ[n] + T·(x[n+1] + k3·ẋ[n+1] − y[n+1])) / (k2 + T·k1)
```
"This is what I use in my game now, but I still keep the pole matching solution when ωnT > ζ because it produces more accurate results when
taking large steps". Pole matching is used to correct k1/k2, "so that the state variables (y and ẏ) remain unchanged, allowing for seamless
switching between regular operation and pole-matching operation."

### 5.5 Quaternions [confirmed]
Patreon: "1. Orient the input quaternion x to face the same direction as state y 2. Compute the state update function as described in the
video 3. Normalize the output quaternion y before returning". Reddit: "flip the sign of x if the dot product of x and y is negative".
YouTube: "For Quaternions I use Vector4 (from quaternion xyzw) and don't use Euler angles at all." Physically correct version (optional):
`ẋ = Log(x[n+1]·x⁻¹[n])/T`, `y[n+1] = exp(T·ẏ[n])·y[n]`, `ẏ[n+1] = ẏ[n] + T(Log(x[n+1]·y⁻¹[n+1]) + k3·ẋ[n+1] − k1·ẏ[n])/k2`.

---

## 6. Character-specific rendering tricks [confirmed]

1. **Far half of the body in shadow** (tweet 2021-05-15, image `refs/chars/01`): "messing around with character shaders. Silly stupid-easy
   idea: always put the far half of the body in shadow, to mimic the #pixelart trick to make limbs read better." In the image the far arm is
   near-black teal (`#082020`), the far leg darker skin (`#907060` vs `#d8a078`).
2. **Cheating perspective** (tweet 2022-11-08, diagram `refs/chars/05`): "little trick for cheating perspective to show the profile of
   characters a little better than the camera angle normally allows… in Unity, this can be accomplished without any special shaders by just a
   3 object transform hierarchy (that can be solved using SVD)". Diagram: Case 1 "Rotate Toward Camera" has "weird collision / weird depth
   clipping / weird shadows/reflections"; Case 2 "Rotate+Skew Toward Camera": "better collision, better depth sorting, plausible
   shadows/reflections, looks the same in-camera as case 1". (Aug 2022 he hit a Unity bug skewing skinned meshes: fixed by unticking
   "Optimize Game Objects" on import.)
3. **Texel snapping of the character root** in the camera basis (02 §3; "the snapping of the player must match the snapping of the camera
   exactly"). Not snapping bones individually.
4. **Same toon pipeline as the world**: "the first step after initial computation of the lighting is to match luminance to the object's
   palette. It's similar to the shading technique in wind waker." / "there are material sliders to adjust the quantization thresholds for each
   object." (39A0n24PX8g replies).
5. **Dithered see-through shader** for foreground occluders (39A0n24PX8g description; frame `refs/chars/06`: the bush in front of the
   character's boots is drawn as a regular dot grid so the boots show through).
6. **Height-indicating fake shadow** via a decal (2022-05-22): "works perfect for a height-indicating fake shadow? even interacts with the
   #pixelart grass correctly", caveat "wouldn't work great on overhangs since it doesn't know about occlusion". (The character also casts
   real shadow-map shadows in all clips.)
7. Effects on/near characters (fire, rain): fire = "a standard unity particle effect with several different types of particles (core, flames,
   embers) drawing additively, and then a pixel-art post-processing shader on top. It can be composited into a scene using a second camera";
   "Different parts of the fire (core, flames, embers) run at different frame rates to emulate a hand-animation look"; ~100 particles. A viewer
   said it looked "glued on like a sticker" because of saturation; he agreed "the colors need some more work". Burning objects write burnt
   grass into a render texture (AcVDCCNqvzg).
8. Parallax (cCUCMBmc9yQ) is only for distant geometry: "it's 2 cameras with frustums that meet so the far clip of one matches the near clip of
   the other." The character is always in the near, orthographic, texel-snapped part. Nothing character-specific.

---

## 7. The player character: design and pixel measurements

Reference frames (`refs/chars/`, gitignored):
| file | source | shows |
|---|---|---|
| `01_far_half_shadow_2021-05.png` | tweet image, 4 poses, 6× zoom | design, far-half shadow, tones |
| `02_anim_video_idle_1080p_crop.png`, `02b_…_lowres_x8.png` | 1FrIBkuq0ZI 0:07.5 | idle/run pose, reconstructed texels |
| `03_smear_frames_2021-06.png`, `03b_smear_lifecycle_60fps.png` | 1FrIBkuq0ZI 0:12–0:25 | 5 smears; one smear over 12 frames |
| `04_smear_mesh_bezier_2021-06.png` | tweet image | smear mesh wireframe + handles |
| `05_cheating_perspective_2022-11.jpg` | tweet image | rotate vs rotate+skew diagram |
| `06_forest_dither_seethrough_2021-04.png` | 39A0n24PX8g 0:05 | dark-coat variant, dithered occluder |
| `07_gameplay_forest_2022-05_720p.png` | tweet video (640x360 at 2×) | in-game scale |
| `08_dialogue_2023-12_720p.png` | tweet video (640x360 at 2×) | latest look |
| `09_spiderbot_inspector_2022.png` | KPoeNZZ6H4s 14:20 | robot + parameter values |

### Design [measured]
- Small elf-like figure: **white hair** (bob + small top tuft/topknot) with a pale-blue shadow tone and a cream highlight; **pointed ears**;
  peach skin; eyes = a 2–3 texel dark line/dots (reads as closed/narrow eyes, no whites); brown hooded **capelet/cape** to mid-thigh; dark
  olive-grey tunic; brown shorts/skirt; bare knees; tall dark-brown boots; dark gloves. 2021-04 forest clip and 2023 dialogue clip: a **black/
  navy coat** version (same hair and ears). Weapon: slim light-grey straight sword held low; swappable (greatsword GIF).
- Silhouette: big light head-cap on a dark/brown trapezoid (cape flares), thin legs. The white hair is the highest-value shape on screen and
  is what reads at gameplay zoom.

### Pixel measurements [measured]
| shot | resolution check | character height (texels) |
|---|---|---|
| Animation video idle (1080p, blocks of 6 px) | 58 blocks; the edit is zoomed so 1 block = 1 game texel | **≈ 58** incl. hair tuft, ~17 wide with cape |
| Far-half-shadow tweet (6× zoom) | 4 poses | **50–58** |
| Forest 2021-04 (1080p, 3 px blocks → 640x360) | | **≈ 60** |
| Gameplay 2022-05 (720p, 2 px blocks → 640x360) | zoomed-out play camera | **≈ 48** |
| Dialogue 2023-12 (720p, 2 px blocks) | | **≈ 62** |
- So at 640x360 the character is **~45–62 texels tall, ≈ 1/6–1/8 of the screen height**. Head (hair top to chin) ≈ 13–15 texels →
  **≈ 4 heads tall** (stylised, big head). Cape width ≈ 16–20 texels.
- **Outline:** no dark silhouette line against the ground or background in any shot. Inside the figure, where the cape overlaps the tunic or the
  skirt hem overlaps the legs, there is a darker 1-texel row (consistent with the depth-outline rule darkening the nearer pixel at an internal
  depth step). Convex-edge highlights are not visible on the character (small, curved, rounded meshes) [low confidence].
- **Tones per material: 2–3** flat bands (lit / shadow, plus the darker far-half or outline row). Example (far-half image, quantised):
  cape `#604030` lit / `#503828` shadow / `#382828` darkest; tunic `#484840` / `#404038`; skin `#d8a078` / `#c89068` / `#907060` (far leg);
  hair `#f8f8f8` / pale blue; boots ~`#583828` / `#302820`; far arm `#082020`. No dithering, no texture noise on the character.
- Snapping: whole figure moves on the texel grid with the camera; between poses the silhouette changes in whole texels.
- 8 directions: there are no sprites; the 3D model is shown at any yaw. Reading in all directions is handled by **animation design** (wide,
  flat swings), far-half shadow, and optionally the cheat-perspective skew.

---

## 8. Algorithms for three.js (r170, our pipeline)

### 8.1 SecondOrderDynamics (scalar / Vector3 / Quaternion) [confirmed math; JS port]
```js
// src/anim/secondOrder.js  [suggested location]
export class SecondOrder {
  // f Hz, z damping, r response; x0: number | THREE.Vector3 | THREE.Vector4 (for quats use .set(q.x,q.y,q.z,q.w))
  constructor(f, z, r, x0) { this.setParams(f, z, r); this.xp = clone(x0); this.y = clone(x0); this.yd = zeroLike(x0); }
  setParams(f, z, r) {
    this.w = 2 * Math.PI * f; this.z = z; this.d = this.w * Math.sqrt(Math.abs(z * z - 1));
    this.k1 = z / (Math.PI * f); this.k2 = 1 / (this.w * this.w); this.k3 = r * z / this.w;
  }
  update(T, x, xd = null) {
    if (T <= 0) return this.y;
    if (xd === null) { xd = scaleAdd(x, this.xp, -1, 1 / T); copy(this.xp, x); }       // (x - xp)/T
    let k1 = this.k1, k2 = this.k2;
    if (this.w * T < this.z) {                                                          // clamp (t3ssel8r v3)
      k2 = Math.max(k2, T * T / 2 + T * k1 / 2, T * k1);
    } else {                                                                            // pole matching
      const t1 = Math.exp(-this.z * this.w * T);
      const alpha = 2 * t1 * (this.z <= 1 ? Math.cos(T * this.d) : Math.cosh(T * this.d));
      const beta = t1 * t1, t2 = T / (1 + beta - alpha);
      k1 = (1 - beta) * t2; k2 = T * t2;
    }
    // y += T*yd ; yd += T*(x + k3*xd - y - k1*yd)/k2
    addScaled(this.y, this.yd, T);
    const acc = combine(x, xd, this.k3, this.y, this.yd, k1);                            // x + k3*xd - y - k1*yd
    addScaled(this.yd, acc, T / k2);
    return this.y;
  }
}
// Implicit-Euler alternative (Patreon, unconditionally stable, slightly over-damped at large T):
//   y += T*yd;  yd = (k2*yd + T*(x + k3*xd - y)) / (k2 + T*k1)
// Quaternions: before update, if (x·y < 0) x = -x; after update, normalise y into a THREE.Quaternion.
```
(`clone/zeroLike/copy/addScaled/scaleAdd/combine` are 5-line helpers that branch on `typeof x === 'number'`.)
Determinism: our scenes are pure functions of `t`, but this filter is stateful. Run it in `engine.onUpdate((t, dt) => …)` with a **fixed
step** (e.g. accumulate `dt`, step at 1/30 s) so a capture at a given `t` is reproducible when rendered from t=0 [suggested]; for
`tools/shot.sh --t` captures, simulate from 0 to t inside the scene.

Starting values (from his robot, then [suggested] for a humanoid):
| use | f | ζ | r |
|---|---|---|---|
| body/root follow with anticipation (robot) | 2 | 0.5 | −2 |
| body/head turn (robot) | ? | 1 | 0 |
| head lag after body (robot) | smaller than body f | 1 | 0 |
| humanoid cape/scarf/hair bone secondary motion [suggested] | 3–5 | 0.4–0.6 | 0–1 |
| weapon/hip lean toward velocity [suggested] | 2–3 | 0.7 | 0 |
| camera follow [suggested] | 1–1.5 | 1 | 0 |

### 8.2 Pixel-animation import for three.js (glTF instead of FBX) [suggested port of the gist]
```js
// Make a THREE.AnimationClip look like t3ssel8r's imported clips.
export function pixelizeClip(clip, { fps = 30, rootBone = 'root', smoothRoot = true, loop = true } = {}) {
  const out = [];
  for (const tr of clip.tracks) {
    const isRootPos = smoothRoot && tr.name === `${rootBone}.position`;
    const n = tr.getValueSize(), times = [], values = [];
    for (let i = 0; i < tr.times.length; i++) {
      const t = Math.round(tr.times[i] * fps) / fps;                 // frame-align keys
      const v = Array.from(tr.values.slice(i * n, i * n + n));
      const prev = values.length ? values.slice(-n) : null;
      const dup = prev && v.every((x, k) => Math.abs(x - prev[k]) < 1e-5);
      if (dup && !isRootPos) continue;                              // delete held duplicates
      if (times.length && times[times.length - 1] === t) { values.splice(-n, n); times.pop(); }
      times.push(t); values.push(...v);
    }
    if (!loop && !isRootPos) { times.push(times[times.length - 1] + 1 / fps); values.push(...values.slice(-n)); } // hold last pose
    const T = tr.constructor;
    const nt = new T(tr.name, times, values);
    nt.setInterpolation(isRootPos ? THREE.InterpolateLinear : THREE.InterpolateDiscrete); // stepped poses, smooth travel
    out.push(nt);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, out);
}
```
Root motion: extract `root.position` x/z into gameplay movement (smooth), zero it on the skeleton, then **snap the character root to the
texel grid** with `engine.camera.snapObjectToTexel(characterRoot)`. Use option A (stepped travel) only for slow actions (§3.3).
Mixer: drive `mixer.setTime(t)` from `t` (deterministic); because tracks are discrete, any `t` gives the held pose.

### 8.3 Smear generator [confirmed algorithm; geometry details suggested]
```js
// Called once per animation update (30 Hz) with the blade's world transform this update and last update.
// Blade local frame (his convention): +Z = blade (hilt→tip), +X = cutting edge, +Y = swing axis.
const k = (theta) => 0.5 + 0.06 * theta;       // tangent scale ≈ 0.5…0.66 (fit: best circular-arc match for 45°…180°)
function buildSmear(prev, cur, { inner = 0.35, len = 1, segs = 20, rHilt = 0.6 }) {  // rHilt: hilt distance to swing pivot (≈ arm length) [suggested]
  // prev/cur: {pos: Vector3 (hilt), quat: Quaternion}
  const ax0 = new THREE.Vector3(0, 1, 0).applyQuaternion(prev.quat);           // green axis
  const dq = cur.quat.clone().multiply(prev.quat.clone().invert());
  const theta = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));                    // swing angle
  // trigger: large AND along the attack direction (edge leads): tip velocity · edge axis > 0
  const tipPrev = tip(prev, len), tipCur = tip(cur, len);
  const edge0 = new THREE.Vector3(1, 0, 0).applyQuaternion(prev.quat);
  if (theta < THREE.MathUtils.degToRad(40) || tipCur.clone().sub(tipPrev).dot(edge0) <= 0) return null;
  const h = k(theta) * theta;                                                   // handle (angle per unit t), arc fit
  // position handles along the red (edge) axes, rotation handles about the green axes
  const p0 = prev.pos, p3 = cur.pos;
  const p1 = p0.clone().addScaledVector(edge0, h * rHilt);                       // position handles along the red (edge) axes
  const p2 = p3.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(cur.quat), -h * rHilt);
  const ax1 = new THREE.Vector3(0, 1, 0).applyQuaternion(cur.quat);
  const q1 = new THREE.Quaternion().setFromAxisAngle(ax0, h).multiply(prev.quat);  // start + prescribed angular velocity
  const q2 = new THREE.Quaternion().setFromAxisAngle(ax1, -h).multiply(cur.quat);
  const pos = [], q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, s = t * t * (3 - 2 * t);
    const P = p0.clone().lerp(p1, t).lerp(p2.clone().lerp(p3, t), s);         // his 3-lerp "Bézier"
    qa.slerpQuaternions(prev.quat, q1, t); qb.slerpQuaternions(q2, cur.quat, t); q.slerpQuaternions(qa, qb, s);
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    pos.push(P.clone().addScaledVector(dir, inner * len), P.clone().addScaledVector(dir, len)); // inner, outer
  }
  return ribbonGeometry(pos, segs);   // quads between consecutive (inner, outer) pairs; uv.x = t (0 old → 1 new), uv.y = 0 inner → 1 outer
}
```
Smear material (custom ShaderMaterial, obeys the material contract):
```glsl
uniform int uPassMode; uniform float uAge;      // 0 → 1 over the lifetime (≈ 0.1 s = 3 updates at 30 Hz, stepped)
uniform vec3 uBody;  // ≈ srgb #acb8b8 → linear
uniform vec3 uLight; // ≈ srgb #bcc4c4
in vec2 vUv;
// streak noise along the arc: 1D hash per texel row so streaks run along u (the swing direction)
float streak(vec2 uv){ return fract(sin(floor(uv.y * 24.0) * 91.7) * 4375.85); }
void main(){
  if (uPassMode == 1) discard;                 // no outline, not in the normal pass (FLAG_NONE behaviour)
  float age = floor(uAge * 3.0) / 3.0;         // 3 visible stages, stepped
  // erode: trailing end (small u) and inner edge disappear first; then break into streaks
  if (vUv.x < age * 0.9) discard;
  if (vUv.y < age * 0.6) discard;
  if (age > 0.5 && streak(vUv) < (age - 0.4) * 1.6) discard;
  vec3 c = vUv.y > 0.7 ? uLight : uBody;       // two flat tones, lighter band toward the outer edge
  outColor = vec4(c, 1.0);                     // alpha ≥ 0.5 (not emissive), opaque, depthTest on, depthWrite on
}
```
Spawn it after the swing frame is shown, keep it in **world space** (not parented to the blade), delete after 3 stages. Do not add
in-between keyframes in the clip during the swing: the smear is the in-between.

### 8.4 Far half in shadow (toon hook) [suggested implementation of a confirmed idea]
```glsl
// toonMaterial lightNormal / cutMod hook, character materials only.
uniform vec3 uCharCenter;   // world position of the character's pelvis (update per frame)
uniform vec3 uCamFwdFlat;   // camera forward projected to the ground, normalised
// far = behind the vertical plane through the body centre, as seen from the camera
float far = step(0.02, dot(vWorldPos - uCharCenter, uCamFwdFlat));
lit *= 1.0 - far;           // force the shadow band (keep the LoN "ambient" shading so the far side still has form)
```
Better variant [suggested]: decide per bone, not per pixel (left/right limb chains flip whole), so a limb never splits mid-way:
compute `far` per bone on the CPU from the bone's world position and pass as a skinning-weighted vertex attribute or a per-bone uniform.

### 8.5 Rotate + skew toward the camera [suggested math for the confirmed trick]
Goal: render the character as if the camera pitch were lower by β (more profile, less top), but keep feet on the ground and depth sane.
In world space relative to the character root (feet), with camera forward **f** and up **e_y**:
`R` = rotation by β about the camera-right axis tilting the top *away* from the camera; then
`S = R + f · rᵀ`, with `r = (Rᵀ e_y − e_y) / sin(pitch)`. Points move only along view rays relative to R (so the image equals case 1),
heights are preserved (`(S p)_y = p_y`, feet stay on the ground).
```js
function cheatMatrix(camera, beta, pitch = Math.PI / 6) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const f = new THREE.Vector3(); camera.getWorldDirection(f);
  const R = new THREE.Matrix4().makeRotationAxis(right, -beta);          // sign: top leans away from camera; verify visually
  const Rt = R.clone().transpose();
  const r = new THREE.Vector3(0, 1, 0).applyMatrix4(Rt).sub(new THREE.Vector3(0, 1, 0)).divideScalar(Math.sin(pitch));
  const e = R.elements;                                                  // column-major
  const S = new THREE.Matrix4().copy(R);
  const se = S.elements;
  for (let c = 0; c < 3; c++) for (let row = 0; row < 3; row++) se[c * 4 + row] += f.getComponent(row) * r.getComponent(c);
  return S;   // apply as: characterRoot.matrix = T(rootPos) · S · Rot(yaw); matrixAutoUpdate = false
}
```
three.js skinning uses bone `matrixWorld`, so a sheared parent matrix shears the skinned mesh too. β = 10–20° [suggested]; leave it 0
until the base looks right. Shadows: render the shadow map with the unsheared matrix if shadows look wrong (his "plausible shadows").

### 8.6 Rope/cable/scarf [confirmed trick]
Quadratic Bézier between two attachment points; the middle control point = `SecondOrder(f≈2–4, ζ≈0.3–0.5, r=0)` following a rest point
placed `slack` below the chord midpoint; if `slack < 0` raise f ("the spring constant is increased"). Tessellate to ≤ 1 texel per segment.

---

## 9. What this means for an agent-authored character pipeline

1. **Model**: a plain low-poly humanoid, flat-shaded, ~4 heads tall (big head/hair mass), separate shells for cape/hair/boots,
   2–3 flat tones per material via the toon ramp (no painted texture), one high-value shape (white hair) for readability.
   Target **45–60 texels tall at 640x360** (with our default `viewHeight`, size the mesh so `height / texelWorld ≈ 50`).
   Rig: a standard humanoid skeleton (Rigify-like naming) so clips can be shared/retargeted; extra bones for cape/scarf.
2. **Animate on held poses**: author or generate keyframes, then reduce to a few key poses per action (anticipation, contact/smear frame,
   follow-through, recovery). Store as **discrete tracks** on a 30 fps grid; root translation separate and smooth. No mid-swing
   in-betweens.
3. **Readability rules from him**: wide, flat, horizontal swings (read from every yaw); strong anticipation and follow-through;
   far half of the body in shadow; optional rotate+skew toward the camera.
4. **Smears are generated, not authored**: per weapon define the blade frame (+Z blade, +X edge, +Y swing axis) and length; the runtime
   builds a ribbon from the previous and current pose with the 3-lerp/3-slerp interpolation; two flat light tones, no outline, ~0.1 s,
   3 stepped stages, dissolving into streaks.
5. **Procedural layers** (secondary motion, look-at, body lean, robot legs): f/ζ/r filters with his values as presets; fixed-step update.
6. **Render integration**: character goes through the same toon + outline pipeline (FLAG_FULL), root snapped with `snapObjectToTexel`,
   smears/effects FLAG_NONE. Character-attached fire/magic: separate buffer + colour quantisation, sub-parts at different low frame rates,
   desaturate to match the scene.
7. **Acceptance checks for agents** (suggested additions to ART_DIRECTION): (a) height 45–62 texels; (b) no texel-shimmer while the
   character stands still and the camera pans (crawl test with the character registered); (c) pose changes only on the animation grid
   (diff of consecutive 60 Hz renders shows changes at ≤ 30 Hz, and only at keys); (d) smear exists on exactly the frames after a swing
   key, lasts ≤ 0.13 s, has no outline pixels; (e) far-side limbs one band darker than near-side; (f) silhouette readable in all 8 yaws
   (contact sheet of the same pose at yaw 0…315).

---

## 10. Gaps and unknowns

- **No mesh specs**: poly count, exact proportions, texture/vertex-colour scheme and bone count are
  never stated; model "not public".
- **Clip frame rate** not stated (30 Hz inferred from footage). Number of keyframes per clip not stated; from the Cascadeur timeline the
  attack combo has dozens of kept keys at irregular spacing (not countable reliably from 1080p captures).
- **Smear details** not stated: segment count (wireframe ≈ 20–24), trigger thresholds ("If the motion is large"), exact lifetime/texture
  (measured ≈ 0.1 s, 3 stages), whether the smear is lit (it looks unlit). His "exactly equal" Bézier identity is not literally exact
  (§4.1); the handle-length rule ("best approximate a circular arc") is reconstructed here as tangent ≈ 0.5–0.66·θ·R.
- **Far-half shadow implementation** (per pixel vs per bone) and **cheat-perspective β** never given.
- **Character outlines**: no statement; measured as "no dark silhouette line", internal depth-step rows only (low confidence).
- **Procedural humanoid**: none shown (only the robot and ropes); head f for the robot not given.
- **"Thoughts on 3D->2D Cameras"** Patreon post is paywalled (only a one-line teaser), as are "State machines…", "Making progress",
  "Designing dialogue…". His Twitter has no posts after 2023-12; no newer YouTube videos; no shorts.
- Movement-speed/run design (2023-10 tweet: players "aren't pressing the run button and get frustrated that movement is too slow") is
  unresolved in public.
