# Clarabelle — design sheet (cast member `clarabelle`, mascot 15-210)

> "The Parallel Cow. Does two things at once." Identity source (read only): `pipgws/packages/assets/scripts/cast/clarabelle.ts`
> + `refs/cast/clarabelle.png`. Code: `characters/clarabelle.js`. Evidence: `shots/char-clarabelle/`.
> (Stage 0 written before modelling; every number below is re-synced to the code at the end — see §Self-critique.)

## Concept

A round, soft, upright black-and-white dairy cow mascot: big wide head with sideways floppy ears and two little cream
horns, a big pink snout, a red collar with a brass bell, short white legs on dark hooves, a rope tail with a dark tuft.
Adjectives: **soft, cheerful, two-at-once** (big/soft/unstoppable dynamics row of CAST_PORTING §10, with a cheerful
springy streak). Her gimmick everywhere: the two hooves do two DIFFERENT things at the same time (talk, emote), or the
SAME thing in parallel where everyone else alternates (walk arm swing).

## Identity (CAST_PORTING §3)

1. **Silhouette blob at 1×** (ref 1× strip): a wide head (wider than the body) with two horizontal ear paddles sticking
   out sideways + two horn nubs on top = a "T-bar head" over a round body; at E/W the snout bulges forward.
2. **Palette anchors**: white hide with dark slate spots (`#E6E0DE` / `#2E2A34`), pink snout (`#E2A0A4`), red collar
   (`#A8343C`) + brass bell (`#D4A640`).
3. **Prop**: none in v1 (the bell on the collar is the identity accent). Vote uses a vote-only "‖" paddle (see §Unique).
4. **Face**: two 1×2-px dark eyes with a top glint above a big pink snout with two nostrils; no visible mouth at rest.
5. **v1 motion**: 1-px bob, arms swing ±1 px opposite each other, tail hangs to her right behind.

## Body plan and game speed

Upright chibi (`chibi()`, `bodyPlan 'uprightAnimal'`, `locomotion.plan 'biped'` LegGait, plant 'hold').
H = 1.32 m (v2 33 px; horn tips), skull top 1.24 m, heads 2.4 (head 0.52 m), leg 0.34 m = 0.26 H.
v_game = 3.95 H = 5.21 m/s; N = 4 drawings × 2 grid frames (+1 on the contact) → cycle 0.27–0.3 s = 1.07–1.18 H;
step ≈ 0.75 m. Duty bound 2·reach·(leg/H)/(C/H) = 2·0.6·0.26/1.18 = 0.26 → **duty 0.18: a bouncy skip-scurry**.

## Unique to me

1. **Extra animated parts**
   - **Ears** (sideways paddles, 1-link spring chains `earL/earR`, keyed targets): flop UP on flight drawings and DOWN on
     contact drawings in the walk (≥ 25° per drawing pair, keyed in `clips.walk`), perk up in vote, droop in die, one up
     / one down in talk and moo ("two things at once"; r2: ±25–35°, the second action that stays visible at SE).
     r2 re-check (`r2/zc-idle-f0.png`, `turnaround.png`): the 0.40 m ears break the outline at all 8 facings.
   - **Tail** (rope + dark tuft, 1-link spring chain `tail`, keyed target): swishes side to side once per walk cycle
     (keyed ±30°), lazy swish in idle, limp in die.
   - **Bell** (1-link chain `bell` on the chest under the collar): swings back on flight drawings, forward on contact
     (keyed), clinks in talk.
   - **Vote paddle** ("‖", vote-only prop bone `paddle`, authored at 1/20 size, scaled up only in vote). r2 re-check:
     face-on above the head at SE, the game facing (`r2/zzc-moo-se.png` panel 3, `clip-vote.png` f12, bake row SE).
2. **My locomotion — the parallel skip-scurry.** Short legs (0.26 H) at 4 H/s must bounce (CAST_PORTING §8): LegGait
   biped, duty 0.18, 4 drawings per cycle; the contact drawings drop the whole body (heavy cow squash: pos −1…2 texels,
   ears down, bell forward) and the flight drawings lift it (≥ 2 texels, ears up). Unlike every other cast member her
   ARMS SWING IN PARALLEL (both hooves forward together, both back together) — the cow does two things at once by doing
   one thing twice. In talk/moo the camera-side RIGHT hoof does the big gesture and the LEFT a small tap/point, so both
   actions read at SE (r2, `clip-talk.png`, `clip-moo.png`). Slide: LegGait 'hold' plants the contact foot exactly at the pose frame; judged on `game-1x.gif` +
   pose ids `walk:` +1 per hold.
3. **Expressions in the new style** — eyes 2×3 texels (0.075 × 0.1 m) dark slate inset boxes ON the 16-sided head lathe,
   turned to the surface normal, 1-texel cream glint flush in the top-outer corner; blink/closed = eye `s` y −0.8;
   wide = `s` +0.15. Mouth = `jaw` (lower lip under the pink snout) opening 20–28° onto a dark mouth floor (talk, moo);
   the snout itself is the face. Talk: jaw open on alternating keys + ears alternate. Vote: eyes wide, ears up. Die:
   eyes shut, ears and tail droop. Moo: head tipped UP, jaw wide, eyes shut happily.
4. **Game-speed readability** — walk: whole-body bob ≥ 2 texels + ear flap + parallel arm pump carry it (checked on
   `game-1x.gif` and `gamespeed.gif`); talk beats every 6 frames; vote rises in 4 frames; die ≤ 1 s to a held pose; moo
   one 1.6 s gag with 6+ frame holds. Results: §Game-speed pass.

## Proportions (code)

H 1.32 m (horn tips; skull top `SKH` 1.27), chibi heads 2.4, legs 0.65, arms 0.85, shoulders 0.5, hips 0.22. Head lathe
16-sided 0.58 m wide (wider than the 0.44 m body, as v1), snout 0.34 m wide, 0.12 m proud. Ears 0.40 m paddles (r2),
root z −0.12, dir [0.72, −0.35, −0.6] (sideways, back and drooping: the far ear breaks the outline behind the head at
E/W and the near ear hangs in front of the body; at SE the camera-side ear sticks out ≈ 10 texels). Measured: 42–46 texels at vh 10
(`height_px` PASS), head_frac 0.42, face_lit 91 %.

## Palette (code `PALETTE`, 5 slots + accent)

| slot | hi | mid | sh | parts |
|---|---|---|---|---|
| hide | #F2EEF0 | #D8D2DC | #A49AB0 | head, body, arms, legs, ears, tail rope (r2: neutral white + `material.whiteKeep 0.8`, golden stays white) |
| spot | #62587A | #443C4E | #3A3040 | spots (cut out of the lathe surfaces; r2 Holstein-size patches), her LEFT forearm, a RIGHT-thigh patch, hooves, eyes, tufts, mouth inside, paddle bars |
| pink | #FAC4D4 | #E49CB2 | #AC6884 | snout + lower lip, ear insides (signature) |
| red | #D4545C | #A8343C | #7A2E44 | collar, nostrils |
| horn | #FAF0D2 | #E2D2AC | #A89880 | horns, eye glints, vote paddle |
| brass (accent) | #FFE08A | #D4A640 | #9A7444 | bell |

## Timing charts (code `CLIPS`, 30 Hz grid, all `interp: 'step'`)

- **idle** loop 72, `dynamics 'hold'`: f0 rest (tail left) · f18 LEFT ear flick up 28° (4 f) · f22 rest · f30 breath 1 (tail
  swings right 28°) · f36 breath 2 · f54 blink (2 f) · f56 · f66 breath 1.
- **walk** (LegGait biped, blend 'add', length 4, one key per drawing): contact = pos −0.03, ears −30°, BOTH upper arms
  back 28°, bell fwd 25°, tail ±28° · flight = pos +0.03, ears +30°, BOTH arms forward 28° + elbows 45°, bell back.
  **run** same shape, ±40° ears/arms, +0.05 lift.
- **talk** loop 24, beat every 6 f: f0 jaw 24°, r2: camera-side RIGHT hoof out-up (out 95), LEFT hoof taps forward (fwd 55), L ear up / R
  down · f6 jaw 0, bob −0.04, arms swap roles, ears swap · f12 jaw 22°, right hoof up by the cheek, left hoof forward · f18 = f6.
- **vote** one-shot, held: f0 dip −0.05 (4 f) · f4 the "‖" paddle (scale 1/20 → 1) up in the RIGHT hoof (upperArmR
  [165, 0, 25] nearly straight up, hand twist −38° so the card faces the SE game camera: face-on at SE, angled at S/E, edge-on only at NE), eyes wide, ears up, `vote@paddleTop` · hold to f30+.
- **die** one-shot, held: f0 sway, half-lid, ears droop (8) · f8 knees buckle −0.14 (6) · f14 sits back LOWER (r2: pos −0.4, knees 68; 5–9 texels below f8 at every facing) (4) · f18 lies on
  her LEFT side, eyes shut, knees up, tail limp, `die` + `land` · hold to f60+.
- **point** one-shot (length 40, `dynamics 'snap'`): f0 wind-up, both hooves drawn in at the chest, half-lid (4) · f4
  "THAT one!": BOTH hooves forward-and-up along the facing (R `[120, 0, 8]`, L `[110, 0, 30]`, `.l` 0.35 on upper arm and
  forearm), chest twisted 14° to her LEFT so the camera-side RIGHT shoulder leads, head turned back −14 onto the target,
  eyes wide, ears pricked forward, jaw 10, bell back (6) · f10 same aim, ears relax (held 20 → 26 f = 0.87 s at 1×) · f30
  hooves ease down (6) · f36 idle. The parallel cow points with both hooves at once.
- **ghost** loop 64 (`spec.ghost { hover 0.14, keepHue 0.3 }`): 4 keys × 16 f, 1-texel drift, both hooves floating forward
  together, ears and tail sway in opposite phases, a half-lid on key 3; module draws ramp, gold halo, floating legs.
- **ghost-spent** loop 72: 4 keys × 18 f, sinks 0.02–0.05 m, head bowed 9 / spine 4 (16 + 8 hid the face), ears drooped
  −38, hooves hanging, tail limp, eyes half-lid; module draws the dimmer ramp, no halo.
- **moo** (emote): f0 inhale, half-lid (6) · f6 MOO: head up 10°, jaw 24°, eyes shut, RIGHT hoof WAVES high, LEFT
  hoof POINTS forward, `emote:note@crown` · r2: f6/f20 the RIGHT hoof up by the ear (upperArmR out 170), f14/f26 out at the chest (out 100, elbow 70) = a ≈ 10-texel arc in front of the head at SE; ears flap one up / one down per beat · f26 half-moo (8) ·
  f34 second moo (10) · f44 idle.

## Secondary motion (code)

Chains (1 link each, targets keyed per clip): ears f 5 ζ 0.75 g 0.15 limit 35 `tip: 'axis'`; tail f 4 ζ 0.6 g 0.4
limit 45; bell f 6 ζ 0.6 g 0.4 limit 35. personality body f 2.5 ζ 0.75, head f 3 ζ 0.75 (soft/big). `quant { yaw 8,
chain 4 }`. One-shots `dynamics 'snap'`, loops `'hold'` → `hold_redraws` 0 in vote and moo.

## Game-speed pass (Stage 6; rendered on render-host RTX 4090)

- `game.readable` PASS: 3.95 H/s, cycle 0.278–0.289 s, 1.10–1.14 H per cycle, 4/4 drawings per cycle, holds 2–3
  (dir 1 pack + `dir0/` + `dir2/`). Pose ids (`raw/clip-game.json`): `walk:k0 → k2 → k3 → k4:0:1 → k5:1:1 …`, +1 per
  2 grid frames after the first cycle (the first cycle skips drawing 1, module M7 not fully fixed for this case).
- Contact visible: both hooves ≥ 2×2 texels at dirs 0/1/2 on every drawing (`clip-game.png`, `dir0/clip-game.png`,
  `dir2/clip-game.png`); bob ≈ 2–3 texels between contact and flight (`gamespeed.png` rows 1–2 vs 3–4).
- `foot_slide` n/a (skip gait, stance < 1 drawing; LegGait 'hold' plants the contact foot at the pose frame).
- 1× read (`game-1x.gif`, `gamespeed.gif`): a bouncy **skip** with both hooves pumping together and the ears flapping —
  the parallel-arm pump is the one thing no other cast member does.

## Self-critique (Stage 7)

Evidence in `shots/char-clarabelle/` (pack `--preset cast --raw`: 74 pass / 22 warn / 0 fail), `dir0/`, `dir2/`,
`z-g8a…f.png` (8-facing key stills ×3, `p` confirmed), `self/sil-lineup.png`, `gamespeed.png`, `bake/`.

| # | criterion | score | evidence | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 1 | `self/sil-lineup.png`: T-bar head (ears + horn nubs) distinct from all 15 (closest: frog's wide head at S, separated by the ear bar); `turnaround.png` E/W: ears only a 2–3 texel nub behind the head | ears that break the E/W outline ≥ 3 texels |
| 2 | Pixel stability | 2 | idle off_grid 0 / flicker 0, pan 0 px, deterministic 0 px; walk upper 0 (legs-only flicker 79 = LegGait hold legs) | — |
| 3 | Line quality | 1 | silhouette_line 0/1071, inner_lines 364, edge 0; speckle 31 isolated px (eyes, nostrils) | fewer 1-px pink isolated px at S/SE |
| 4 | Tonal discipline | 1 | sig.pink iso max 7 (S), sig.ear hi/mid ≥ 50 % only 5/8 (NE/NW 7 %) | lift the ear sh / tip the ears up at the back |
| 5 | Ground separation | 1 | sig_ground 4/4 PASS (noon dH 107, golden dH 44 dL +6 %); `scene-golden-crop.png` the white hide still turns peach | golden: a cooler hide that stays white |
| 6 | Proportion / expression | 1 | face_lit 91 %; talk jaw 24° shows a 1–2 texel dark mouth at S/SE (`z-g8d.png` row 1); blink row 4; moo snout seen from below is busy at S | larger mouth read, cleaner moo face |
| 7 | Animation timing | 1 | single_frame 0 everywhere, vote/moo hold_redraws 0, talk amplitude 36 %; moo wave keys f14/f20 differ only ≈ 3 texels at dir 1 | bigger wave arc |
| 8 | Weight / game speed | 1 | 4/4 drawings, 0.289 s, 1.14 H; feet visible dirs 0/1/2; foot_slide n/a; first cycle skips drawing 1 | measurable stance |
| 9 | Personality / secondary | 1 | ears/tail/bell keyed per walk drawing (`clip-game.png` ears up/down alternate); turn audit by eye only (`clip-turn.png`), no raw-diff settle count | raw-diff turn/hold audit |
| 10 | Smears / FX | 1 | note glyph on moo f6+, vote sparkle at the paddle, die dust; no smears (no swings needed) | — |
| 11 | Facing / turns | 2 | `clip-turn.png` 45° steps held ≥ 2 grid frames, all 8 facings read in `turnaround.png` | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2 / 1, deterministic, night_freeze 0, rendered on RTX 4090 | — |

**Total 15 / 24.** Three weakest points: (1) the ears nearly vanish at E/W and are mostly shadow at NE/NW; (2) the white
hide turns peach in golden sun; (3) talk/moo mouth and the moo wave are small changes at 1× (≈ 2–3 texels).

## Round 2 (critic-clarabelle 16/24 fixes; rendered on render-host RTX 4090)

Evidence: `shots/char-clarabelle/` (pack `--preset cast --raw`: **83 pass / 22 warn / 0 fail**, page_errors 0),
`r2/` (8-facing key stills `g8c-*` / `zc-*` ×3, SE zooms `zzc-moo-se.png`, twist sweep `zsv-t*.png`, 1× GIF strips
`game1x-strip.png`, `die1x-strip.png`, `moo1x-strip.png`, `vote1x-strip.png`, turn logs `turn/`, `turn2/`), `bake/` (7 clips × 8 dirs).

| critic issue | fix (code) | re-check |
|---|---|---|
| vote card edge-on at SE/E | upperArmR [165, 0, 25] (arm nearly vertical), handR twist −38 (sweep −105…130 in `r2/zsv-t*.png`) | `r2/zsv-t-38.png`: face-on above the head at SE, angled at S/E/SW/W/N, edge-on only at NE; `clip-vote.png` f12; key_speckle +16 → +13 |
| golden peach "pig" | hide → neutral #F2EEF0 + `material.whiteKeep 0.8`; pink cooled to #FAC4D4 | `scene-golden-crop.png`: lit hide stays white with black spots; sig_ground golden-sun dH 44 → 48 |
| die pops up at f14 | die:14 pos −0.4, hips roll 40, knees 68 | head top per facing (`clara_tops.py`): f8 173/171/166/164… → f14 181/176/172/173… → f40 188/183/177/178…: lower at all 8; `clip-die.png`, `r2/die1x-strip.png` |
| gimmick hidden at SE | talk/moo: RIGHT hoof (camera side) waves, LEFT taps/points; ears one up / one down per beat | `clip-talk.png` f0/f12 and `clip-moo.png` f14/f22 show both hooves at SE; moo wave ≈ 10 texels (hoof by the ear → out at the chest) |
| ears vanish at E/W | EAR len 0.30 → 0.40, root z −0.12, dir [0.72, −0.35, −0.6] | `turnaround.png`: ears break the outline at all 8 facings; sig.ear px min 44 |
| spots too light | body spots rp ×1.45, ry ×1.4; LEFT forearm dark; RIGHT-thigh patch | `turnaround.png`, `clip-game.png` |
| turn settle redraws | locomotion stepYaw 90, stepTol 0.12, stepTime 0.14 | `r2/turn2` log: recovery steps 6 → 5, last landing after the first turn at 0.975 s (facing reached 0.6 s); the other redraws in f18–f38 are idle keys 18/22/30/36 (ear flick, tail, breath), not settle |

Not fixed (not mine): talk bubble gap at f18 of the first loop (fx.speech.chain, `clip-talk.png` f12/f18 have no bubble).
Remaining weak points: pink isolated px 7–8 at S/SE (nostrils), ear hi/mid 10 % at NE/NW, walk legs flicker 82 (LegGait hold).
Self-score r2: 1 Sil 2 · 2 Stab 2 · 3 Line 1 · 4 Tone 1 · 5 Ground 2 · 6 Expr 1 · 7 Timing 2 · 8 Weight 2 · 9 Pers 2 · 10 FX 1 · 11 Turns 2 · 12 Tech 2 = **20 / 24**.

## Round 3 — cast close-out: point, ghost, ghost-spent (rendered on render-host RTX 4090, 2026-10-17)

Added the three Clocktower game clips the wave-3 build lacked (CAST_GALLERY "missing game clips"); nothing else changed
(idle/walk/run/talk/vote/die/moo keys, parts, palette untouched). Evidence: `shots/char-clarabelle/` (full pack
`--preset cast --raw`: **115 pass / 19 warn / 0 fail**, `cast_clips` PASS "all", page_errors 0), `r3/` (8-facing stills,
probes, 1× strips), `bake/` (10 clips × 8 dirs, cell 70×84, no border touch after auto growth).

| clip | check | evidence |
|---|---|---|
| point | off_grid 0, flicker 0, hold_redraws 0, pose_read 31 %, strobe 1; key_speckle +9 WARN | `clip-point.png`, `r3/s1x-point.png` (1× SE: 133 ms wind, 870 ms aim hold, return), `r3/z-r3.png` row 2 |
| point aim per facing | hoof ≥ 4 texels outside the idle outline: S (left hoof, ≈ 6), SE (white RIGHT arm forward-up past the snout, ≈ 6), E (right, ≈ 8), SW/W (left, ≈ 6–8); N/NE/NW also show an arm | `r3/z-r3.png` rows 1 (idle) vs 2 (point f12), `bake/` point rows |
| ghost | off_grid 0, flicker 0, key_delta 45 %, amplitude 28 %; pale ramp + gold halo, pink snout and red collar faintly kept (keepHue 0.3) | `clip-ghost.png`, `r3/s1x-ghost.png`, `r3/z-r3.png` row 3 |
| ghost-spent | off_grid 0, flicker 0, key_delta 32 %, amplitude 14 %; dimmer grey-blue, no halo, head bowed but snout visible at S/SE | `clip-ghost-spent.png`, `r3/s1x-ghost-spent.png`, `r3/z-r3.png` row 4 |

Probes (variant spec `shots/char-clarabelle/pv.js`, `pt=` JSON overrides on the aim keys): `r3/z-pv.png` symmetric V
fwd 105 → 130 (105 read as a level thrust); `r3/z-pv2.png` — every symmetric V put the far, dark-forearmed LEFT arm out as
the pointer at SE (shaded as far half, `r3/z-ptdbg.png` row 2 `look=far`), with the white right arm hidden in front of the
chest; the chest twist +14 (row 3 = shipped) brings the white RIGHT arm out at SE/E. First ghost try at keepHue 0 made
the face one pale blob and head 16 / spine 8 hid the spent face (`r3/z-new.png` rows 3–4).

Remaining weak points: at SE the pointing right arm draws in its shade tone (the lit face points up/away), so the pointer
is a mid-grey arm with a dark hoof rather than white; at S only the left hoof clears the outline (the right hoof sits on the
chest); point key_speckle +9 (the dark hooves over the white chest).
