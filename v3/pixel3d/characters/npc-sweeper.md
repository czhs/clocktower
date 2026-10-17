# npc-sweeper — Sweeper (NPC) — design sheet

Identity source (read only): `pipgws/packages/assets/scripts/cast/npc-sweeper.ts` ("a plain, muted townsperson with short
grey hair, a slate tunic and a straw broom. Deliberately boring so it never competes with the players' characters") +
`refs/cast/npc-sweeper.png`. Spec: `characters/npc-sweeper.js`. Renders: `shots/char-npc-sweeper/`.

## Stage 0 — brief

**Concept:** the town's street sweeper — a small, quiet worker with a grey bob haircut who always has the straw broom in
the LEFT hand and scurries along pushing it ahead. **Adjectives:** plain, diligent, unhurried-but-busy (CAST_PORTING §10
"boring on purpose (NPC)": default dynamics, quieter than any player, but every clip must still read at 1×).

**Identity (CAST_PORTING §3):**
1. Silhouette blob at 1×: a round grey bob cap (wider than the shoulders) + the broom standing beside the body on the
   character's LEFT (screen-right at S/SE, screen-left at N/NW) with a flared straw fan on the ground; at E the broom is
   pushed ahead diagonally (v1 E row).
2. Palette anchors: mauve-grey hair `#6C6870`, slate tunic `#5A5E66`, straw `#9A8765` + wood `#6A5640`, tan skin `#A58060`.
3. Prop: straw broom, LEFT hand (v1 `under()` at S/SE draws it at x 18 = character's left; at N at x 6 = also left).
4. Face: two dark 2×2 dot eyes under a straight fringe, no visible mouth at rest (v1 drawHuman 'short' hair).
5. v1 motion: `sweep = p.step` — the broom foot shifts with every step (it sweeps as he walks), 1-px bob.

**Body plan:** small townsperson on `chibi()` (CAST_PORTING: NPCs → `bodyPlan: 'biped'`), H = castHeight(27) = **1.08 m**
(≈ 39 texels at vh 10; `heightPx` [34, 46]), 2.7 heads (head 0.40 m incl. hair), legs 0.8 (leg ≈ 0.29 H), flat face
(snout 0), no ears/tail.

**Game speed:** V = 3.95 · 1.08 = **4.27 m/s**; N = 4 drawings × 2 grid frames → cycle 0.267–0.3 s, C ≈ 1.2–1.3 m
(1.1–1.2 H), one step ≈ 0.64 m. Leg 0.315 m, stance span ≤ 0.9·hip(0.37) = 0.33 m → duty ≤ 0.33·…/C ≈ 0.25 → a **scurry**
(LegGait 'biped', `plant: 'hold'`, duty 0.2, swingFloor 'gait').

**Silhouette vs cast:** closest blobs = mole (27 px, grey, prop upright) and npc-porter/vendor (other NPCs, built in
parallel). Separator: the broom's straw FAN on the ground beside the feet at S/SE/SW/N and the diagonal stick at E/W;
the bob cap is rounder/wider than mole's goggled head.

## Unique to me

1. **Extra animated parts.** The BROOM is the only accessory and it carries everything: bone `broom` (child of `handL`,
   KEYED per clip, no spring — a stiff wooden prop). Walk: pushed ahead, bristles near the ground, swished side to side
   ≥ 25° per drawing pair (v1 "sweep = step"). Talk: stays planted (the right hand talks). Vote: raised overhead
   bristles-up (prop ≥ 0.3 m over the crown). Point: tilted forward-up as a pointer stick next to the pointing right arm.
   Die: falls flat beside him. Emote: three sweep strokes with dust puffs. Hair is a rigid cap (no chain: v1 has none).
2. **My locomotion — a busy scurry with the broom pushed ahead.** v1 walks; he is a plain townsperson, not an animal.
   LegGait 'biped' plant 'hold' at V 4.27 m/s, 4 drawings, duty 0.2, reach 0.6, bob 0.04 m (≥ 1 texel). The visible rhythm
   = whole-figure bob + the broom swish (big, light straw mass) + right arm swing; feet show below the short tunic
   (no robe). Slide: the 'hold' drawings put the contact foot planted ahead; foot_slide judged on pose frames + 1× GIF.
3. **Expressions in the new style.** Eyes = 2×2 dark boxes (`eyeL/R`, 0.07 m) flush on the flat face under the fringe;
   blink = `eye.s` y −0.8 (2 frames) in idle; closed eyes in die; WIDE (y +0.3) in vote. Mouth = a dark plate hidden in
   the face, pushed out with `mouth.p` on talk open keys (3×2 "o"); a small open mouth on the emote finish. No brows (v1
   none). Emotion carried by head roll/tilt (≥ 20°) and the broom.
4. **Game-speed readability.** walk: bob + broom swish every drawing (checked on `game-1x.gif`, `clip-game.png`, pose-id
   log). talk: right-hand beats ≥ 25° every 8 frames, 32-frame loop. vote: up in 4 frames, bristle fan above the hair at
   25 %. die: ≤ 1 s to a held lying pose. sweep: strokes on 6-frame holds (0.2 s each) so each reads at 1×.

(timing charts, palette numbers, self-critique: filled from the final code below)
