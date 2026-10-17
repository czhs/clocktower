# Requin (cast `requin`, mascot 15-213) — design sheet (r2)

"A French shark in a beret. Bombs are personal." Spec: `characters/requin.js`. Identity source (read only):
`pipgws/packages/assets/scripts/cast/requin.ts`, `refs/cast/requin.png`. Pack: `shots/char-requin/` (`--preset cast --raw`,
**81 pass / 26 warn / 0 fail** (r2; r1 73/25/0), RTX 4090 on render-host); dir-2 game pack `shots/char-requin/dir2/`; evidence stills
`shots/char-requin/self/`; bake `shots/char-requin/bake/` (not copied into `out/sprites/`: outside this agent's ownership).

## 0. Brief
- Concept: a friendly upright grey-blue shark on stubby legs — ONE bullet-shaped egg that is head and body at once —
  white belly, toothy grin, dorsal fin + crescent tail, a navy-black beret cocked to his right with a little stalk, a red
  neckerchief knotted in front, and a little lit bomb dangling from his LEFT pectoral fin (the 15-213 bomb lab).
- Adjectives: **suave, cocky, nonchalant** → body f 2.8 ζ 0.7 r −0.3, head f 3 ζ 0.75 r 0 (`spec.personality`); crisp
  step holds, a 12-frame hold on the shrug punchline.
- Body plan: **upright chibi** (`chibi({ height 1.36, heads 2.2, legs 0.5, arms 0.7, snout 0 })`, joints re-placed;
  `bodyPlan 'uprightAnimal'`, heightPx [42, 54]). The chest carries the lower egg (white belly = front 135° sector of the
  same 16-sided profile, skin behind), the head the upper egg (snout bulge, eyes, grin, beret); the neckerchief (neck
  bone) sits on the seam. H 1.36 m (v2 34 px); measured 42–44 texels at vh 10 (`height_px`).
- Game-speed arithmetic: v_game = 3.95·H = 5.37 m/s, run 2·v. Leg 0.195 m = 0.14 H → duty bound ≈ 0.15: stepping cannot
  hold a plant over two drawings → a **skip with flight**: LegGait 'biped', `plant: 'hold'` (sprite-style leg drawings,
  no per-frame re-pin), `surge: false`, poses [4, 4], duty [0.25, 0.2], lift [0.05, 0.07], cycleTime [0.3, 0.267];
  authored `clips.walk` (length 4) adds +0.06 m flight drawings. Measured: 0.267 s / 1.05 H per cycle, 4/4 drawings,
  holds 2×23 (`game.readable` PASS, dir 1 and dir 2).

### Identity (ref facing)
1. Blob (S, SE): rounded bullet + flat beret disc tipped to his right + two pectoral fins out-and-down (a star at S);
   dorsal fin + two-lobed tail break the back at E/W/NE/NW (`turnaround-silhouette.png`).
2. Palette (r2): skin `#9CB4CE/#6C88A4/#4C5C80` (v1 #6C88A4), belly `#F8E8FF/#E6DCF4/#BCB2C6` (magenta-cool so golden
   reads pale rose, not peach; `material.slots.belly.lift 0.18`, `whiteKeep 1`), beret `#58607E/#3A3E56/#383048`
   (v1 #2A2632), scarf `#EE6262/#C03640/#7E2A48`, dark (bomb, eyes) `#4A4258/#342E40/#241E2E` (hi capped so the lit
   eye stays dark), accent spark `#FFF4B8/#FFD860/#F09A3A`, 2nd accent mouth `#74304A/#4A1C2C/#3A1634` (v1 MOUTH
   maroon; took the slot of the r1 vote baguette, which is gone).
3. Prop: lit bomb on `handL` (screen-right at S/SE like v2), fuse cord up-and-out, spark on its own bone. Carried
   forward (fin fwd 42, out 34) so the bomb shows in front of the body at E/W as in the v1 profile sprites.
4. Face: 0.085 m dark eyes (≈ 3 texels, `dark` slot, solid dark + 1 glint px at S/SE/SW — no lilac '+' any more) +
   0.024 m glint; grin = 4 cream upper teeth over the maroon `mouth` slot + 3 lower teeth on the jaw.
5. v2 motion kept: bob (now +0.06 m flight), fins swing, bomb rides the left fin, spark flickers.

## Unique to me (r1 — tied to renders)
1. **Extra animated parts** (all KEYED; the 1-link tail spring was tried and removed: A/B `wv=n` was pixel-identical in
   the idle, and the die/emote strobe FAILs went away after it and the FX re-timing):
   - **Tail** `tail0` (hips, back-down, crescent = two convex hulls): rests swept 32° to his left (v1 N sprite: tail to
     one side; edge-on it was a 1-px stick at N); walk sweeps −30 / −6 / +30 / +6 per drawing against the hips yaw
     ±12 (the S-wave), run ±34, die flops 40.
   - **Pectoral fins** (flat blades 0.08–0.09 thick, plane yawed 18° so the near fin shows as a blade, not a 1-px line,
     at E: `dir2/clip-game.png` on upperArm + forearm): walk swing ±20–40° per drawing; talk
     alternates the bomb fin up-out (out 84) and the right fin forward (fwd 74); shrug both out 108.
   - **Beret** (bone `beret`, KEYED in r2): band ring + overhanging puff (4 rings, merged facets) + stalk, cocked
     [−6, 0, 14]. Walk: rolls ±10° with the hips yaw on the contacts, lags ±0.03 m (up on landing, down in flight) —
     the tilt alternates in `game-onion.png` / `r2/z-game1x-strip.png`; run ±12; talk cocks per beat (10 / 4 / −6 / 4);
     shrug cocks 16; vote 8; die knocked askew 14.
   - **Bomb spark** (`spark` bone, accent): two sizes alternate (idle every 12 f, walk every drawing pair, talk on the
     closed keys), goes OUT in the die (`spark.s` −1).
   - **Vote = the bomb itself** (r2): the bomb fin shoots up-and-out beside the beret (shoulder `.p` +0.08, wrist bent
     out −60 so the fuse and spark face the camera), spark flares 1.5× (`r2/g8-vote-f20.png`, `clip-vote.png`).
   - **Jaw** (`jaw`, hinge y 0.795 z 0.06): rest gap shows the tooth row; talk 22–26°, shrug 18°, die slack 12–16.
   - **Eyes** `eyeL/R.s`: blink (idle f52), wide (vote 0.1/0.25), half-lid (shrug −0.5, hug −0.7), shut (die −0.8).
   - FX: `speak` (talk f2 + f14; module workaround, see self-critique), `vote@handR` (f4), `sparkle@fuse` (f6) + `emote:heart` (f12) + `poof@fuse` (f24), `die` (f17),
     step dust every 2nd footfall — every FX event sits ON a key frame (strobe 1 in every clip).
2. **Locomotion — swaggering skip ("swim-strut").** The egg yaws ±12° toward the stepping foot and the tail sweeps
   ±30° the other way, chest rolls ±4°, flight drawings pop +0.06 m (≈ 2 texels over contact), the bomb fin swings
   less than the free fin. `clip-game.png` (dir 1), `dir2/clip-game.png`, `game-onion.png`: 4 distinct drawings, legs
   alternate, contact foot drawn ahead. `foot_slide` n/a (hold mode: no foot planted in two drawings; in-hold ride is
   inherent, module design); walk/game flicker 66–69 px legs-only on one same-pose frame (upper 0).
3. **Expressions.** Eyes on a 16-sided egg at x ±0.12, yaw 33°, tilted up to the surface; solid dark + glint at S, SE
   and SW (`r2/z-face-a.png`). Talk (r2): head twists −12 / chest −8 TOWARD the camera at SE on the open keys and the
   bomb fin hangs low and out, so at SE (the game facing) both eyes and the full maroon grin with both tooth rows read
   (`r2/z-face-c.png` row 1). Shrug punchline: chin UP (head −16), half-lid, face visible at S/SE (`r2/z-face-b.png`,
   `clip-personal.png` f20). face_visible stays 55 % (idle: the low beret brim covers the brow — measured, unchanged).
4. **Game-speed readability.** Walk: hop + yaw + tail sweep carry the rhythm in the strips/onion (the Read tool shows
   one GIF frame, so the 1× motion read is inferred from `clip-game.png`, `game-onion.png`, `gamespeed.png` next to the
   v2 sprite). Talk: beat every 6 frames, amplitude 39 %. Vote: 4-frame dip → up at f4, held 1.97 s (26 % off idle).
   Die: on its back by f17 (≈ 0.57 s after the lead-in), held belly-up (149 % off idle). Emote: pose_read 24 % held 4+.

## Proportions (vh 10, 36 px/m)
| part | m | texels |
|---|---|---|
| height (beret stalk) | ≈ 1.33 | 42 (S) – 44 |
| egg (body + head) | 0.22 → 1.12, Ø 0.60 × 0.55 | 32 tall, 21 wide |
| beret puff | Ø 0.54, 0.12 thick | 19 wide |
| visible legs | 0.22 | 6–8 |
| fin | 0.29 long, 0.16 root | 10 |
| bomb | Ø 0.22 | 8 |
| (r1 vote baguette removed in r2) | — | — |

## Timing charts (30 Hz, step; = code)
- idle (72, `dynamics 'hold'`): f0 A · f12 A + spark small · f24 A · f30 B · f36 C · f48 C + spark · f52 blink · f56 C · f66 B + spark.
- walk (4): 0 L contact (pos −0.012, hips yaw +12, tail −30, R fin fwd 34) · 1 flight (+0.06, spark small) · 2 R contact
  (yaw −12, tail +30, L fin fwd 30) · 3 flight. run (4): same at lean 14, flight +0.10, tail ±34.
- talk (24, `speak` f2 + f14): f0 jaw 26, chest [−3,−8,6] head [−6,−12,0], right fin up-out, beret cock 10 · f6 jaw 2,
  pos −0.028 · f12 jaw 24, chest [−3,−8,−6], right fin forward, beret −6 · f18 jaw 3. Bomb fin [14,0,62] throughout.
- vote (length 40, held): f0 dip (4), bomb fin cocked · f4 BOMB FIN up [−8, 0, 166] (+0.08 shoulder), wrist −60, spark
  big, eyes wide, beret 8, `vote@handL`.
- die (60, legs fk, `die` f17): f0 spark out, stiff, eyes wide · f6 knees go · f12 topple back · f17 on the back, rolled
  −28° toward the camera · f21 settle, the bomb fin folds the bomb onto the belly (`DIE_HUG`), held (`clip-die.png` f29).
- personal (emote): f0 bomb up, a look (6) · f6 right fin flick at the fuse, `sparkle@fuse` (6) · f12 SHRUG, both fins
  out 140, chin up (head −16, twist 14), beret cocked 16, half-lid, `emote:heart` (12) · f24 hug, `poof@fuse` (10) · f34 idle.

## Lights
None (no `spec.lights`; the spark is an accent part).

## Self-critique (Stage 7, r1 — historical, superseded by r2 below)
Evidence: full pack `shots/char-requin/report.txt` (73/25/0, RTX 4090); `dir2/` game pack; 8-facing stills
`self/z-{idle-f0,talk-f0,talk-f12,personal-f12,personal-f24,vote-f20,die-f50}.png`; line-up `self/sil-lineup.png`;
`gamespeed.png`; scene crops; bake preview. NOT run: per-facing tone counts by hand, `look=far`, `outlineDebug`, 8-facing
stills of every key (idle extremes/walk drawings/run), raw-diff hold audit beyond the report rows.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `self/sil-lineup.png`: only blue-grey bullet in the cast, closest = mushroom/crow (hat-on-bell) but fins + dorsal/tail break the bell at 8/8; beret both halves 8/8 (sig.beret ≥ 137 px) | dorsal 0 px at S (by design) |
| 2 | Pixel stability | 1 | idle/talk/vote/die/emote off_grid 0 flicker 0; walk/game flicker 66–69 legs-only | module leg redraw |
| 3 | Line quality | 1 | speckle 37 WARN; near fin edge-on = 1-px line over the body at E (`dir2/clip-game.png`) | thicker fin edge / rotate fin plane |
| 4 | Tonal discipline | 1 | beret isolated max 6 (sig 9) WARN; dark slot 11 tones | merge beret band/puff facets |
| 5 | Ground separation | 2 | sig_ground 4/4 PASS (noon −49/−40 %, golden −73/−42 %); belly white at S/SE/SW after lift | — |
| 6 | Proportion / expression | 1 | face_lit 97 %; face_visible 55 % WARN (SE far eye a sliver); mouth reads at S, half at SE | head twist toward camera |
| 7 | Animation timing | 1 | single_frame 0, strobe ≤ 1, hold_redraws 0 every clip; vote baguette crosses the beret at E/NE (`self/z-vote-f20.png`: top − beret top ≈ S 14, SE 6, E 0, NE 3, N 11, NW 19, W 24, SW 22 texels) | vote clearance at E/NE |
| 8 | Weight / contact / game speed | 1 | game.readable PASS 4/4, 0.267 s / 1.05 H at dirs 1+2; foot_slide n/a; 1× GIF motion not watchable via Read | measurable plant |
| 9 | Personality / secondary | 1 | tail/fins/spark keyed and visible per drawing; no spring lag in turns (chain removed) | tail chain without strobe |
| 10 | Smears / FX | 1 | FX on key frames (strobe 1); no 8-facing FX stills | FX stills |
| 11 | Facing / turns | 1 | 8 facings read; turn.foot_slide 4.96 WARN, turn.islands 2 | — |
| 12 | Technical | 2 | page_errors 0, deterministic 0 px, vote.deterministic 0, draw calls 2/1, night_freeze 0 | — |

**Total 15 / 24 (self).** Weakest: (1) vote baguette crosses the beret at E/NE (right fin is the far side at the game
facing, so the raise had to twist the chest); (2) face at SE shows one eye and half the grin; (3) walk contact is a
drawn skip, not a measurable plant (foot_slide n/a), and the near fin is a 1-px line edge-on at E/W.

## Self-critique r2 (after critic-requin r1, 16/24)
Fixed (all 'character' issues), each re-rendered and looked at: eyes on a dark slot with hi #4A4258 (no '+'/X-eye:
`r2/z-face-a.png`); maroon `mouth` slot + head twisted to the camera + bomb fin low/out on talk (SE grin reads:
`r2/z-face-c.png`); shrug chin-up, fins out 140, half-lid (`clip-personal.png` f20); beret keyed in walk/run/talk/
shrug/vote/die (`game-onion.png`); die bomb on the belly (`clip-die.png`); vote with the raised bomb, baguette removed
(`clip-vote.png`); run bomb out to the side in 4/4 drawings with its spark (`clip-run.png`); golden belly #F1B889 →
#E3B9B3 (`scene-golden-crop.png`); fin blade yawed 18° + thicker (`dir2/clip-game.png`); beret puff 6 → 4 rings
(isolated max 6 → 5). Pack 81 pass / 26 warn / 0 fail, game.readable PASS 3.95 H/s 0.267 s 1.05 H/cyc, head_bob 2.5 px;
1× GIF frames 60–70 ms (`r2/z-game1x-strip.png`). Talk bubble: present from grid f5 on every frame (FX on 116/121
frames), one re-pop (small) at the f14 beat. Still WARN: face_visible 55 %, dark 11 tones, speckle 38, foot_slide n/a.
