# Vendor (cast `npc-vendor`) — design sheet

NPC, no blurb ("deliberately boring so it never competes with the players", pipgws `cast/npc-vendor.ts` header).
Spec: `characters/npc-vendor.js`. Pack: `shots/char-npc-vendor/` (final `--preset cast --raw`), evidence
`shots/char-npc-vendor/{self,k3,k4,pr,r1..r10}/`, bake `shots/char-npc-vendor/bake/` (lead copies it to `out/sprites/`).
Identity source (read only): `pipgws/packages/assets/scripts/cast/npc-vendor.ts` + `lib-d-human.ts`,
`refs/cast/npc-vendor.png`. Render host: render-host (RTX 4090) for every render. Round 1 (author), 2026-10-16; **round 2** (author, after critic r1
15/24) 2026-10-16: evidence `shots/char-npc-vendor/s2/` (probes `*-g.png` = 8 facings S SE E NE / N NW W SW, x4;
final key stills `fin-*-g.png`; 1x GIF frame grids `gg-*.png`; 25 % line-ups `lineup/`).

## 0. Brief
- Concept (inferred from the sprite): a market-stall vendor — olive skin, dark-brown hair pulled up into a **bun**, a
  muted ochre-brown work coat, a plain **cream apron** (bib + skirt, ties at the back), dark trousers, brown shoes. Her
  job is selling produce: the emote is **calling out her wares** with an apple held up.
- Adjectives: **plain, practical, brisk** → CAST_PORTING §10 "boring on purpose (NPC)": default-ish personality
  (body/head f 2.5 ζ 0.9 r 0), plain holds, quieter motion than any player (no chains, small idle).
- Body plan: plain townsfolk on `chibi({ height 1.09 (skull top), heads 3.05, legs 0.75, arms 1.0, snout 0, neck 0.1 })`
  → ≈ 3 heads like the v1 lib-d-human body; `bodyPlan 'biped'`, LegGait `plan 'biped'`.
- Identity (CAST_PORTING §3): (1) blob = round head with the **bun knob on top-back** over a slim blocky body;
  (2) palette coat `#76603E`, apron `#BCB29E`, hair `#4E3A2C`, skin `#B48E68` (v1); (3) no v1 prop — the apple is the
  emote's story prop only; (4) face = two dark 1×2 eyes, small mouth; (5) v1 motion: 1-px bob, leg shuffle.

## Unique to me
1. **Extra animated parts.**
   - **Apron skirt** — its own bone `apron` (hinge at the waist front, to just above the knee). r2: NARROWER (front face 0.14–0.16 m,
     0.18–0.21 m with the short curved side returns; was a flat 0.26 m slab) so coat shows on both sides at SE and the legs show
     under it (`s2/a-idle-g.png` vs critic `vc-turn-A.png`). Keyed, not sprung
     (a spring trails at 4 H/s): walk 22°/6°/22°/6° per drawing (kicks forward off each leading thigh), run 30/12,
     die 40→30→merged away in the lying hold (scale ≈ 0: the folded skirt was dashed cream specks between the
     trousers; the bib stays), ghost −6. Moves ≥ 16° between drawings in the gait.
   - **Bun** — rigid on the head; r2 BUN_R 0.088 → 0.11, set 0.015 higher: `sig_outside.bun` 16–27 px at 8/8 (was
     8–17), a clear knob at 25 % S/N (`s2/lineup/lineup-{S,N}.png`).
   - **Apron bow** — static, one chunky hull + two tails at the back (a thin waist band was a dotted line, removed).
   - **Apple** (story prop, `wares` bone on the right hand, geometry at 1/1000, `wares.s` 999 only in `callout`).
   - **Mouth plate** (`mouth` bone): a dark 0.06 × 0.045 m plate sunk 0.06 m in the face, pushed out 0.05 m
     (`mouth.p`) and scaled (`mouth.s` y +0.45·k) on open keys → a 2×2 dark "o" at S/SE.
   - FX: speech bubble (talk, callout), `emote:exclaim@crown` (callout), `vote@handR` sparkle, die dust + wisp, step
     dust every 2nd footfall. No smears (nothing is swung; Clocktower rule).
2. **My locomotion: a brisk scurry** (plain biped, nothing species-specific — she is a townsperson). H 1.20 m,
   V = 3.95·H = 4.74 m/s; leg (hip 0.39 m → ankle) 0.33 m = 0.27 H → duty bound 2·0.6·0.27/1.19 ≈ 0.27 → duty 0.2
   (a run with a flight phase). LegGait `plan 'biped'`, `plant 'hold'`, `swingFloor 'gait'`, `contactReach 0.45` (r2), cycleTime 0.3, poses 4,
   duty [0.2, 0.1], reach 0.6, bob [0.04, 0.07], lift [0.05, 0.08], arms [26, 34], elbows [14, 22], lean [5, 10],
   authored walk (blend 'add') keys the apron + a 2–3° head counter-nod. Measured: `game.readable` 3.95 H/s,
   **0.30 s / 1.19 H per cycle**, 4/4 drawings every cycle, holds 2–3; `game.head_bob` 2.5 px (limp 0);
   `game.feet_visible` PASS (r2: SE min 3 px, k2 7/21 px; shoes moved to the lighter coat slot so the contact foot
   separates from the dark trousers). `foot_slide` n/a: at duty 0.2 no foot is planted on two
   consecutive drawings (playbook: not a slide; judged on `game-onion.png` and `gamespeed.png`).
3. **Expressions in the new style.** Head = a 24-sided skin ellipsoid inside a hair shell whose front/lower cells are
   cut out (the face window: r2 fringe down to lat 20° in the centre (was 28°: a 6-texel bare forehead) / 12° at the sides, temple hair above eye level, back hair
   to the nape) — no proud hair parts, the hairline is the inner line. Eyes: dark 0.058 × 0.08 boxes ON the surface
   at x ±0.072 (az ≈ 22°), front ≈ flush → 2×2 at S, near eye + a 1-px far sliver inside the face at SE, eye at the
   front edge at E/W (az 34° put the far eye outside the contour at SE; 0.085 hid it; `r9/m2-g.png`, `m4-g.png`).
   Blink/half/wide by `eye.s` y (−0.8 / −0.45 / +0.15). Nose = a skin bump that makes the E/W profile.
   talk = mouth "o" on alternate keys + head turned TOWARD the camera (twist −12/−14) + a hand beat; vote = normal eyes (r2: WIDE on a tilted head rasterised into a "+" glyph at S),
   mouth a little open; die = eyes shut; callout = eyes wide + mouth wide (k 1.1–1.3), normal eyes on the head-back key.
   r2 face: head + neck skin merged (`material.merge { head: 'neck' }`) so the chin inner line no longer draws a
   dark "goatee" band at S/SE (`s2/h-w2-zz.png` vs `g-w2-zz.png`); skin sh lifted #7E604A → #8C6A50. face_visible 53 %
   (was 48 %; the hair shell covers the face sides by design, eyes 2×2 at S).
4. **Game-speed readability.** Walk: the bob (2.5 px), the alternating legs + apron kick and the arm swing carry it;
   one-word read **scurry** (`game-onion.png`, `gamespeed.png` next to the v2 sprite). Talk: a beat every 8 frames
   (`talk.amplitude` 32 %, key_delta 64 %). Vote up on f4 (0.13 s) and held 1.67 s; r2 hand clears the bun top by ~4 texels at SE and ~3 at E, 8/8
   (`s2/fin-vote-f12-g.png`). Point out on f4, held 24 f.
   Die down by f22 (0.73 s), held 2.07 s. Callout: apple out to the side on f6, a DIFFERENT second call on f18 (up on her toes, head
   back, apple up-and-out at 45°, left hand cupped at the mouth), back by f38. r2: the 1× GIFs were checked frame by
   frame with their real delays (`s2/gg-clip-{vote,callout,die}-1x.png`, `s2/gg-game-1x.png`) and `gamespeed.png`
   (regenerated from the r2 raw game clip).

## Proportions (vh 10, 36 px/m) — height_px S 40 (38–41), head_frac 0.39 (WARN: the v1 head is 1/3 + the bun)
| part | m | texels |
|---|---|---|
| bun top (H) / skull top | 1.20 / 1.11 | 43 / 40 |
| head joint (chin) / shoulders | 0.73 / 0.67 | 26 / 24 |
| head (skin ellipsoid) r x·y·z | 0.19 · 0.198 · 0.188 | 14 wide |
| hips / knee / ankle | 0.39 / 0.21 / 0.06 | 14 / 8 / 2 |
| apron skirt | waist → 0.23 | 8 tall |

## Palette ([hi, mid, sh]; 5 slots + 1 accent)
coat `#9A8052 #76603E #544232` · apron (signature) `#D8CEB6 #BCB29E #8E8474` · hair (+ bun, shoes) `#6A4E3A #4E3A2C #3E2E2C`
· skin `#C29A72 #AA8460 #7E604A` · dark (trousers, eyes, mouth) `#463E4A #3A3236 #342C38` · accent wares (apple)
`#D0705A #A84A3C #6E3434`. Material: `innerLine 'tone'`, `creamKeep [1, 0.85]` (cream apron at golden).

## Timing (30 Hz grid; `interp 'step'`)
| clip | keys (frame: what) | length |
|---|---|---|
| idle | 0 rest · 30 breath (−0.028, chest 3) · 36 blink · 38 breath · 56 glance (head twist 14, tilt 6) · 66 rest | 72 loop |
| walk / run | 4 drawings (LegGait), apron 22/6/22/6 (run 30/12), head ±2–3 | gait |
| talk | 0 open + right hand beat + head toward camera · 8 closed · 16 open + left hand · 24 closed; speak@0 | 32 loop |
| vote | 0 dip (arm off the body) · 4 right arm up [164, 0, 22] `.l` 1.7/1.45, open hand (`handR.s` [0.5, 1.2, 0.3]), head tilted away; held | 31 (+hold) |
| point | 0 wind · 4 right arm along the facing [108, 0, 8] `.l` 0.5/0.4 + chest twist 18 + left forward-low · 20 re-aim · 28 · 38 return · 44 rest | 50 |
| die | 0 sway, back of the hand to the brow · 10 knees buckle · 16 a clean 45° tip (hips out 45) · 22 lying FLAT on the left side (hips [0, 0, 88], skirt merged away); die+land@22. Compact facings: NE + W/SW | 61 (+hold) |
| callout | 0 hand in the apron (apple hidden) · 6 apple out to the side [105, 0, 40], fist on hip, "!" · 18 on the toes, head back, apple up-out [152, 0, 45], left hand at the mouth, speak · 30 lowering (arm out, off the body) · 38 rest | 44 |
| ghost / ghost-spent | 4 keys × 16 / × 18, hover 0.14 (spec.ghost), spent bowed 5° in all (was 22°: the face vanished at S) + half-lidded | 64 / 72 loop |

## Self-critique (round 2, after critic r1 15/24; final pack `shots/char-npc-vendor/` 116 pass / 19 warn / 0 fail)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `sig_outside.bun` 16–27 px at 8/8 (r1 8–17); `s2/lineup/lineup-{S,N}.png` (30 members): a clear bun knob over a round hair mass, no longer a plain column next to npc-porter; apron 0.18–0.21 m (r1 0.26) with coat both sides at SE (`turnaround.png` SE, `s2/a-idle-g.png`) | still the slimmest body (NPC, by design) |
| 2 | Pixel stability | 2 | off_grid 0, flicker 0, pan 0 px, deterministic; micro WARN 2–4 px | — |
| 3 | Line quality | 1 | die key_speckle +6 PASS (r1 +25), point +6 PASS (r1 +14), callout +10 WARN (r1 +15), vote +8 WARN (dip key) | the last isolated px on the callout head-back key |
| 4 | Tonal discipline | 1 | apron isolated px 3 at SE/NW (unchanged; bib top + hem corners, `turnaround-isolated.png`); colors/slot dark 14 | — |
| 5 | Ground separation | 2 | sig_ground noon sun/shade + golden sun/shade all PASS (golden-sun dH 8 dL +25 %, r1 WARN +14 %; noon-shade −28 %); `scene-golden-crop.png` | — |
| 6 | Proportion, appeal, expression | 1 | fringe down to 1–2 texels above the eyes (`s2/b-idle-z.png`), no chin "goatee" (`s2/h-w2-zz.png`), face_visible 53 % (r1 48 %), ghost-spent eyes visible at S (`s2/fin-gs-f0-g.png`) | face_visible ≥ 60 % would need a smaller hair shell (fights the v1 helmet) |
| 7 | Animation timing | 2 | vote hand over the bun 8/8 (SE ~4, E ~3 texels, `s2/fin-vote-f12-g.png`); callout keys 6 vs 18 different silhouettes at S/E/W (`s2/fin-callout-f8-g.png` vs `s2/m-c20-z.png`, key_delta 69 %); die lying flat, lying read at S/SE/E/N/NW, compact at NE + W/SW (`s2/fin-die-f50-g.png`); 1× frame grids `s2/gg-*.png` | — |
| 8 | Weight, contact, game speed | 1 | game.readable 3.95 H/s, 0.30 s, 4/4, head_bob 2.5 px, feet_visible SE min 3 px (k2 7/21); `gamespeed.png` beside v2; foot_slide still n/a (duty 0.2) | a planted pair at duty ≥ 0.3 (would break the 0.27 duty bound at this reach) |
| 9 | Personality, secondary | 1 | apron keyed kick 22/6; the new callout (toes, head back, hand at mouth) is hers; gait still stock LegGait | — |
| 10 | Smears and FX | 1 | no smears; module FX; bubbles cropped in the bake (game draws its own) | — |
| 11 | Facing and turns | 2 | turnaround 8/8; turn.foot_slide 3.36 WARN (unchanged) | — |
| 12 | Technical | 2 | page_errors 0, draw calls 2/1, GPU line RTX 4090 in `report.txt` | — |
| | **total** | **18** | | |

## Self-critique (round 1; evidence in `shots/char-npc-vendor/`)
| # | criterion | score | evidence (file · facing/frame · number) | what would raise it |
|---|---|---|---|---|
| 1 | Silhouette | 2 | `turnaround-silhouette.png`; `self/lineup-{S,SE,E,N}.png` (29 members): bun knob unique, `sig_outside.bun` 8–17 px at 8/8; apron visible 8/8 (21–104 px); closest = npc-elder / skeleton-chef (no bun knob / toque) | a wider S/N feature (she is the slimmest blob, by design) |
| 2 | Pixel stability | 2 | every clip off_grid 0, flicker 0, strobe 1; `pan` 0 px; deterministic idle + vote; micro WARN 2–4 px | remove the 2–4 px micro pops |
| 3 | Line quality | 1 | silhouette_line PASS, inner_lines tone; isolated apron px 3 at SE/NW (want ≤ 2); key_speckle WARN die +25, callout +15, point +14 | clean bib/skirt junction at SE, fewer lying specks |
| 4 | Tonal discipline | 1 | `sig.apron` hi/mid 0.88–1.0 at 8/8, `sig.bun` 1.0; colors/slot WARN dark 11; isolated 3 | the isolated px above |
| 5 | Ground separation | 1 | `scene-*-crop.png` read in all six copies; sig_ground noon sun/shade + golden shade PASS, **golden-sun WARN dH 7 dL +14 %** | a cooler apron hi for golden (identity kept muted on purpose) |
| 6 | Proportion, appeal, expression | 1 | face_lit 96 % (S .97 SE .95 SW .97); face_visible WARN 48 % (hair shell over the face slot by design); eyes 2×2 at S, 1×2 + sliver at SE (`r9/m4-g.png`); talk mouth 2×2 at S (`k3/g8-talk-f0-g.png`) | bigger expression range (brows, a smile) |
| 7 | Animation timing | 1 | holds as planned in every `clip-*.png`, single_frame 0, hold_redraws 0, talk key_delta 64 %; 8-facing stills of vote 4, point 4, die 16/22, callout 6/18, talk 0/16, walk k0/k1 (`k3/`, `k4/`, `self/`) — **1× GIFs not watched as motion** (Read shows the first frame) | watch every `clip-*-1x.gif` in a viewer |
| 8 | Weight, contact, game speed | 1 | game.readable 0.30 s / 1.19 H, 4/4 drawings, head_bob 2.5 px, feet_visible SE min 2 px (k2 2 px); foot_slide n/a (scurry, no planted pair) | a contact drawing with both feet ≥ 2×2 at SE k2 |
| 9 | Personality, secondary | 1 | apron keyed 16°/drawing in the walk; no chains (quiet NPC by design); turn audit `clip-turn.png` 45° steps, holds ≥ 2 | a small secondary (apron string tails) that settles |
| 10 | Smears and FX | 1 | no smears (none needed); speech/exclaim/vote/die FX from the module, exclaim at the crown socket, not judged at 8 facings | 8-facing FX stills |
| 11 | Facing and turns | 2 | turnaround 8/8 readable (`r10/g.png`, `turnaround.png`); `clip-turn.png` holds 2–6, turn.single_frame 0 | — |
| 12 | Technical | 2 | page_errors 0, deterministic, draw calls 2/1, night_freeze/night_pan 0 px, GPU line RTX 4090 in `report.txt` | — |
| | **total** | **16** | | |

Weakest three: (1) golden-sun apron vs grass (dH 7°); (2) die/callout specks + isolated apron px; (3) motion read at
1× judged from strips/stills, not from watched GIFs; contact drawing k2 shows only a 2-px foot at SE.

## Bake
`tools/charpack.sh --bake npc-vendor --preset cast --cell 90 --out shots/char-npc-vendor/bake` → 10 clips × 8 dirs,
r2: trimmed cell 54×69, anchor [27, 56], sheet 324×5520 (r1 56×66) — the longer vote arm adds the height; vote and die rows
checked in `s2/bake-{vote,die}.png` (hand and lying body inside the cell); frames idle 5, walk 4 (= gameSpeed.drawings), run 4, talk 4, vote 2,
point 6, die 4, ghost 4, ghost-spent 4, callout 5; no warnings but "FX cropped" for talk/callout bubbles (the game draws
its own). Without `--cell` the auto growth went to 122 and clipped the heads (module issue, CHARACTER_LEARNINGS §Module
backlog). Not copied into `out/sprites/` (lead's job).
