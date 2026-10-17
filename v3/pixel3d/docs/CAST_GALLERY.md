# Cast gallery — run 05 close (character pipeline lead, 2026-10-17)

All 31 Clocktower cast members (27 player characters + the Storyteller + 4 NPCs; `nicksong` skipped by the user,
`pipeline/skip.txt`). **None ships yet** (ship bar 19/24, no zeros on rubric 1–3 or 7). Rubric and process:
`docs/CHARACTER_PLAYBOOK.md`; lessons and the ranked open backlog: `docs/CHARACTER_LEARNINGS.md` §Run 05 close.

## Line-up renders (render-host RTX 4090, `scenes/cast-lineup.js`, driver `shots/cast-gallery/lineup.py`)

One scene, every member side by side, same camera (yaw 45, pitch 30), same light, 36 px/m (the game zoom), idle t = 1,
no FX, 0 page errors in all 6 renders. Re-render: `tools/remote.sh python3 shots/cast-gallery/lineup.py` and then
`rsync -az 'render-host:pixel3d/shots/cast-gallery/*.png' shots/cast-gallery/` (quote the glob: zsh).

| file | what |
|---|---|
| `shots/cast-gallery/lineup-noon-dir1-a.png`, `-b.png` | pack facing (SE, dir 1), noon, plain ground, x3 (frog → polly / clarabelle → porter) |
| `shots/cast-gallery/lineup-golden-dir1-a.png`, `-b.png` | the same at golden hour |
| `shots/cast-gallery/lineup-{noon,golden}-dir1.png` | the whole row in one image, x2 |
| `shots/cast-gallery/lineup-sil25.png` | **25 % silhouette line-up** at S, SE, E, N (key mask, BOX ÷4 = charcheck's thumbnail method, shown x4) |
| `shots/cast-gallery/lineup-sil100.png` | the same silhouettes at 1x (x2) |
| `shots/cast-gallery/gifs-a.png`, `gifs-b.png` | contact sheet of every "best GIF" below (every ~12th frame, x2) |

What the line-up shows (looked at):
- **Family read holds**: one chibi scale, one outline weight, one light; heights at SE 35–62 px (1x).
  The Storyteller is the tallest figure (62 px + the clock staff), the only deep purple, and its staff gives the one
  thin vertical spike at all four facings of the 25 % row — the user's "most unmistakable silhouette" rule holds.
  Other strong 25 % reads: chonk (largest mass, 1371 px area at SE), cilantro (neck column), crow (hat brim), mushroom
  (cap + staff), maxflow, the snail at E, the sweeper's broom.
- **25 % look-alikes**: at S, a cluster of narrow plain columns — skeleton-chef, rabbit, green-hood, npc-vendor,
  npc-elder, npc-porter — and a cluster of boxy two-bump blobs — frog, owl, toad, progress, preservation, opal, theo-rem.
  This is R W3 #4 / R W5 (NPC lozenges) still open at the cast level.
- **Golden hour**: white/cream identities drift on members that predate the whiteKeep/creamKeep opt-ins — chonk white →
  apricot, rabbit → peach, skeleton-chef toque → tan, moth cream → tan, mushroom spots/robe → tan
  (`lineup-golden-dir1-a.png`); members with the opt-ins (clarabelle, requin, maxflow, theo-rem, the NPCs) and the
  Storyteller's purple hold.

## Table

Critic = art-director round-1 score of the build it judged (frog, mushroom: the last critic round); self = what the
orchestrator recorded (waves 4–5: the round-1 self-score; waves 1–3: the latest author self-score, after the fix /
touch-up round, never re-critiqued — see the evaluation in `docs/CHARACTER_LEARNINGS.md`). Clips from
`characters/<id>.js` (dumped with `shots/cast-gallery/specs.js` on the host). Best GIF = the signature emote at 1x, real
time, from the newest pack (all 31 looked at in `gifs-{a,b}.png`). "Missing" = game clips the cast preset requires.

| # | cast member | wave | critic | self | body plan (gait) | clips (emote **bold**) | missing | best GIF |
|---|---|---|---|---|---|---|---|---|
| 1 | frog (Sir Croaksworth) | 1 | 18 | 19 | hopper | idle talk vote die point ghost ghost-spent **oath** | — | `shots/char-frog/clip-oath-1x.gif` (touch-up pack `t2/pack/`) |
| 2 | mushroom (Brother Morel) | 1 | 15 | 18 | upright animal (hop) | idle talk vote die point ghost ghost-spent **bless** | — | `shots/char-mushroom/clip-bless-1x.gif` |
| 3 | fox (Ginger) | 1 | 15 | 19 | upright animal (biped) | idle talk vote die point ghost ghost-spent **whisper** | — | `shots/char-fox/clip-whisper-1x.gif` |
| 4 | owl (Archivist Hoot) | 1 | 17 | 20 | upright animal (bird) | idle talk vote die point ghost ghost-spent **remember** | — | `shots/char-owl/clip-remember-1x.gif` |
| 5 | crow (Mortimer) | 1 | 15 | 19 | upright animal (biped) | idle talk vote die point ghost ghost-spent **dig** | — | `shots/char-crow/clip-dig-1x.gif` |
| 6 | moth (Lumen) | 1 | 16 | 19 | upright animal (legacy gait) | walk run idle talk vote die point ghost ghost-spent **lamp** | — | `shots/char-moth/clip-lamp-1x.gif` |
| 7 | goat (Magistrate Billings) | 1 | 15 | 18 | upright animal (biped) | idle talk vote die point ghost ghost-spent **verdict** | — | `shots/char-goat/clip-verdict-1x.gif` |
| 8 | skeleton-chef (Bones) | 1 | 16 | 20 | upright animal (legacy gait) | idle talk walk run vote die point ghost ghost-spent **offer** | — | `shots/char-skeleton-chef/clip-offer-1x.gif` |
| 9 | rabbit (Clover) | 2 | 15 | 19 | hopper (hop) | idle talk vote die point ghost ghost-spent **sniff** | — | `shots/char-rabbit/clip-sniff-1x.gif` |
| 10 | mole (Old Delve) | 2 | 16 | 20 | upright animal (legacy gait) | idle walk run talk vote die point ghost ghost-spent **ring** | — | `shots/char-mole/clip-ring-1x.gif` |
| 11 | snail (Tinker Pell) | 2 | 15 | 20 | limbless | idle walk run talk vote die point ghost ghost-spent **tinker** | — | `shots/char-snail/t1/pack2/clip-tinker-1x.gif` |
| 12 | toad (Toadley) | 2 | 14 | 18 | upright animal (biped) | idle talk vote die point ghost ghost-spent **excuse** | — | `shots/char-toad/clip-excuse-1x.gif` (touch-up pack `t2/pack/`) |
| 13 | green-hood (Wisp) | 2 | 16 | 21 | biped (legacy gait) | walk run idle talk vote die point ghost ghost-spent **glow** | — | `shots/char-green-hood/clip-glow-1x.gif` |
| 14 | honk (goose) | 2 | 16 | 19 | bird (hold) | idle talk vote die point ghost ghost-spent **honk** | — | `shots/char-honk/clip-honk-1x.gif` |
| 15 | chonk | 2 | 16 | 20 | bird (legacy gait) | walk run idle talk vote die point ghost ghost-spent **plop** | — | `shots/char-chonk/clip-plop-1x.gif` |
| 16 | polly (parrot) | 3 | 15 | 18 | upright animal (bird, hold) | idle walk run talk vote die point ghost ghost-spent **squawk** | — | `shots/char-polly/clip-squawk-1x.gif` |
| 17 | clarabelle (cow) | 3 | 16 | 20 | upright animal (biped, hold) | idle walk run talk vote die **moo** | point, ghost, ghost-spent | `shots/char-clarabelle/clip-moo-1x.gif` |
| 18 | requin (shark) | 3 | 16 | 19 | upright animal (biped, hold) | idle walk run talk vote die **personal** | point, ghost, ghost-spent | `shots/char-requin/clip-personal-1x.gif` |
| 19 | progress | 3 | 15 | 17 | upright animal (biped, hold) | idle walk run talk vote die point **step** | ghost, ghost-spent | `shots/char-progress/r7/clip-step-1x.gif` |
| 20 | preservation | 3 | 15 | 20 | hopper (hop, hold) | idle walk run talk vote die **invariant** | point, ghost, ghost-spent | `shots/char-preservation/clip-invariant-1x.gif` |
| 21 | opal (otter) | 3 | 16 | 20 | upright animal (biped, hold) | idle walk run talk vote die **optimize** | point, ghost, ghost-spent | `shots/char-opal/clip-optimize-1x.gif` |
| 22 | cilantro (giraffe) | 3 | 15 | 18 | long-neck (biped, hold) | idle walk run talk vote die **lookout** | point, ghost, ghost-spent | `shots/char-cilantro/final3/clip-lookout-1x.gif` |
| 23 | mincut (red panda) | 3 | 17 | 20 | upright animal (biped) | idle talk vote die walk run **snip** | point, ghost, ghost-spent | `shots/char-mincut/clip-snip-1x.gif` |
| 24 | maxflow (fox mascot) | 4 | 15 | 19 | upright animal (biped, hold) | idle talk vote point die ghost ghost-spent walk run **push** | — | `shots/char-maxflow/clip-push-1x.gif` |
| 25 | theo-rem (hedgehog) | 4 | 17 | 18 | upright animal (biped, hold) | idle walk run talk vote point die ghost ghost-spent **qed** | — | `shots/char-theo-rem/clip-qed-1x.gif` |
| 26 | greenting (Joguman) | 4 | 17 | 17 | upright animal (biped, hold) | idle walk talk vote point die ghost ghost-spent **mystery** | — | `shots/char-greenting/final-r9c/clip-mystery-1x.gif` |
| 27 | storyteller | 4 | 18 | 17 | biped (robe, hold) | idle walk run talk point **chime** appear (+ vote/die keys, unused by the game) | — (exempt from vote/die/ghost) | `shots/char-storyteller/p8/clip-chime-1x.gif` |
| 28 | npc-sweeper | 5 | 16 | 17 | biped (hold) | idle walk run talk vote point die ghost ghost-spent **sweep** | — | `shots/char-npc-sweeper/clip-sweep-1x.gif` |
| 29 | npc-vendor | 5 | 15 | 16 | biped (hold) | idle walk run talk vote point die ghost ghost-spent **callout** | — | `shots/char-npc-vendor/clip-callout-1x.gif` |
| 30 | npc-elder | 5 | 15 | 15 | biped (hold) | idle walk talk vote point die ghost ghost-spent **nod** | — | `shots/char-npc-elder/clip-nod-1x.gif` |
| 31 | npc-porter | 5 | 15 | 16 | biped (hold) | idle walk run talk vote point die ghost ghost-spent **hitch** | — | `shots/char-npc-porter/clip-hitch-1x.gif` |

Critic mean 15.7 (range 14–18; by wave 15.9 / 15.4 / 15.6 / 16.8 / 15.3). Every member also has a game-speed walk
pack (`clip-game-1x.gif` / `game-1x.gif` in the same folder) and a sprite bake (`out/sprites/<id>.*`).

**The seven wave-3 members without point / ghost / ghost-spent** (clarabelle, requin, progress [point only], preservation,
opal, cilantro, mincut) were never given the touch-up round waves 1–2 got (`05c-args.json` `touchup: []`); their
`cast_clips PASS` lines are from packs rendered before the lead added the game clips to the cast preset. A pack today
FAILs `cast_clips`. This is the first ship blocker (see §Run 05 close in the learnings).
