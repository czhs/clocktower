# Porter (cast `npc-porter`) — design sheet

NPC, no blurb ("deliberately boring so it never competes with the players"). Spec: `characters/npc-porter.js`.
Pack: `shots/char-npc-porter/`. Identity source (read only): `pipgws/packages/assets/scripts/cast/npc-porter.ts`,
`refs/cast/npc-porter.png`. Render host: render-host (RTX 4090).

(Stage 0 written before modelling; the sections below "FINAL" are rewritten from the final code + renders.)

## 0. Brief (Stage 0, before modelling)
- Concept (inferred from the sprite + .ts header): a town porter — brown skin, a dark mauve-grey hood framing the face,
  a dull-green work tunic, a leather apron, dark trousers, and a big pale burlap sack slung over the RIGHT shoulder and
  hanging on the upper back, held by a leather strap across the chest (right shoulder → left hip). Adjectives:
  **plodding-steady, dutiful, unremarkable** → the "boring on purpose (NPC)" row: default dynamics, plain holds,
  quieter motion than any player; the only extra is the sack's weight.
- Body plan: **upright townsfolk chibi** (`chibi()` at 2.8 heads, `bodyPlan 'biped'` like the NPC card in
  CAST_PORTING §6), `locomotion.plan 'biped'`, `plant 'hold'`, `swingFloor 'gait'`.
- Game-speed arithmetic: v2 28 px → **H 1.12 m** (≈ 40 texels at vh 10). v_game = 3.95·H = **4.42 m/s**; run 2·v
  (optional). Leg (hip 0.386 → ankle 0.06) = 0.326 m = 0.29 H → duty bound 2·0.6·0.29/1.15 ≈ 0.30 → duty 0.22
  (brisk scurry with a short flight), N 4 drawings × 2 grid frames → cycle 0.27–0.3 s ≈ 1.1 H, step ≈ 0.62 m.
- Identity (ref facings):
  1. Blob at 1×: a dark rounded HOOD mass on a small body + the pale SACK breaking the outline over the right shoulder
     at S/SE/SW (screen-left of the hood at S) and filling the whole back at N/NE/NW (pale disc on dark).
  2. Palette anchors: hood `#3A3438` (16 % of the sprite), sack `#897A61/#A19276`, skin `#8A6448`, tunic `#4E5A46`,
     leather `#5C4432`, trousers `#33302C`.
  3. Signature prop: the sack on the back, slung over the RIGHT shoulder (strap across the chest). No hand prop.
  4. Face: brown face in a dark rectangular hood opening, two 1×2 dark eyes, a 1-px mouth/blush at SE.
  5. v2 motion: 1-px bob, legs shuffle, the sack rides the bob.
- Silhouette vs the cast: closest look-alikes are green-hood (hood, void face, green) and storyteller (hood, purple,
  tallest). The porter has an OPEN brown face (no void, no glow), no peak, and the pale sack lump is the read.

## Unique to me (planned before modelling; verified in FINAL)
1. **Extra animated parts.**
   - **Sack** (bone `sack`, child of `chest`, pivot at the strap knot on the right shoulder; KEYED, no spring — a 1-link
     spring lags 0.2–0.3 m behind at 4 H/s, playbook R W3): in the walk it drops 1 texel and swings forward on each
     contact drawing and lifts/swings back in flight (one drawing behind the body = weight); hitched up in the emote,
     hoisted overhead in the vote, slides off onto the ground in the die, still worn by the ghost.
   - **Apron flap** (bone `apron`, hips front): kicks with the steps in the walk (keyed ±12°).
   - **Mouth** plate (bone `mouth`, buried in the face, pushed out with `mouth.p`): talk; eyes squash for blinks.
   - FX: speech bubble, vote sparkles at the sack, step dust, die dust, `emote:drop` (sweat drop) on the hitch.
2. **My locomotion: a loaded scurry** — LegGait 'biped' (duty 0.22, 4 drawings, plant 'hold'), forward lean 6–8° under
   the load, bob ≥ 1 texel, the sack bouncing a drawing behind the body carries the rhythm (the biggest light mass).
   Contact drawing = boot (leather tone, contrasting with the dark trousers) planted ahead; flight = boots tucked.
3. **Expressions.** Eyes 2×2 texels (dark boxes flush-proud on the face front, eye slot hi ≤ #4A4258), small nose bump
   for the E/W profile, mouth plate 3×2 on open talk keys; blink = eye squash; vote = eyes wide + face up; die = eyes
   shut; emote = eyes shut on the hitch then a relieved puff (sweat drop).
4. **Game-speed readability.** Walk judged on `game-1x.gif`, `clip-game.png`, `game-onion.png` and the pose-id log;
   talk beat every 10 frames; vote up in ≤ 6 frames; die down in < 1 s; emote holds ≥ 6 frames.

## Clips (timing plan, 30 Hz)
- idle (72, step): breath 0/30/36/66, blink f50–52, a small sack settle at the breath peak.
- walk (4 drawings, blend add): sack + apron keyed per drawing, body lean.
- talk (40 loop): open/closed every 10 f, left hand gesture + head roll toward the camera.
- vote (one-shot, held): f0 dip → f4 the sack hoisted overhead on the right hand (≥ 0.3 m above the crown), held.
- point (one-shot ≈ 3.5 s held): right arm forward-up along the facing + chest leading with the right shoulder, the
  left hand forward-low (reads at W/SW).
- die (one-shot, held): sway under the sack → knees buckle → topples diagonally, the sack rolls off beside him; lying
  curled, face toward SE.
- emote `hitch` (shift the sack): crouch → pop (sack jumps up the back, shoulders shrug, silhouette rises) → land
  (sack thumps lower) → relieved sweat drop → idle.
- ghost / ghost-spent: `spec.ghost` + plain loops (sack kept: identity), `keepHue` 0.25 (dark figure).
