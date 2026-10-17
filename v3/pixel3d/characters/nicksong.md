# Nick Song (cast member `nicksong`) — design sheet

Villager. "Shaggy hair, sly smirk, never looks up from his phone. Suspiciously pleased."
Identity source (read only): `pipgws/packages/assets/scripts/cast/nicksong.ts`, `refs/cast/nicksong.png`. Code: `characters/nicksong.js`.
(Stage 0 draft — rewritten from the current code at the end of the round.)

## Concept
A slouchy young townsman whose whole body is organised around the phone in his left hand: head tipped at the
screen, shoulders forward, a lopsided closed-mouth smirk. Adjectives: **sly, absorbed, smug** → personality "sly,
smug" (CAST_PORTING §10): late small anticipations, a lingering hold on the punchline, half-lidded eyes.

## Identity (CAST_PORTING §3)
1. Silhouette blob: a huge shaggy black hair mop (≈ 45 % of the height, wider than the shoulders, jagged spikes on
   top and side tufts) on a small plain body (S/SE 1× strip).
2. Palette anchors: near-black purple hair `#221E2F`, charcoal sweatshirt `#44444C`, grey-blue jeans `#5D6F88`,
   light sneakers `#C9CCD2`, cyan screen `#9FE6FF`.
3. Prop: smartphone in the LEFT hand (screen side right at S/SE in v2), held at the belly, always looked at.
4. Face: heavy-lidded slit eyes, lopsided smirk (left corner up), no blush.
5. v2 motion: 1-px bob, the phone hand stays put, the free right arm swings a little.

## Body plan and game speed
Plain townsfolk on `chibi()` (CAST_PORTING §6: nicksong = `bodyPlan 'biped'`), ≈ 3 heads, jeans legs VISIBLE (no robe).
H = castHeight(29) = 1.16 m (≈ 42 texels). Leg ≈ 0.32 H. v_game = 3.95·H = 4.58 m/s, cycle 0.3 s = 4 drawings × 2–3
grid frames, C ≈ 1.37 m = 1.18 H, step 0.69 m. Duty bound 2·0.6·0.32/1.18 = 0.33 → LegGait 'biped' at duty 0.25 = a
**scurry** with a flight phase. Contact is visible because his light sneakers are outside any hem.

## Unique to me (Stage 0 plan; verified section below)
1. Extra animated parts: phone (own bone; keyed in idle thumb-scroll, talk, vote, emote, die), hair flop tufts on
   a part-less `hairBob` bone that LegGait's left-arm channel drives (±A per step), eyes/mouth by scale.
2. Locomotion: phone-absorbed scurry — the phone arm never swings (rest pose = carry pose, its gait channel re-routed to
   the hair), the right arm pumps, whole-figure bob ≥ 2 texels, sneakers planted by LegGait 'plant'.
3. Expressions: slit eyes 3×2 texels, wide = eye scale up, closed = squash; smirk mouth part opens by scale for talk.
4. Game speed: verify with `game-1x.gif`, `clip-game.png`, pose ids, `clip-*-1x.gif`.

Emote: **pleased** — glances up from the phone at the viewer, smirk widens, eyes go wide-ish, a two-beat chuckle bob,
then back down to the screen.
