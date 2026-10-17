// Events atlas (owner: events group; docs/UI.md §3.4): out/ui/events.{png,json}. Drop-in for the v2 square-props.png
// game-event frames (poof_0..5, glow_warm, glow_cool: names, sizes, anchors, meta.fps.poof kept) + the new-style
// event FX (seat plaques, vote clock, hands, HUD vote clock, caption ribbon, veil tiles, toll/bell/wisp/reveal/candle,
// banners). Night token set: tools/uibake.sh events:events-night -> out/ui/events-night.{png,json}.
//   tools/uibake.sh events [--strict]
import { tokens } from '../kit.js';
import { buildFrames, ANCHORS, FPS, V2_FPS, V2_MS, DIRS8 } from './art.js';
import { TIMING } from './draw.js';

export const eventsMeta = (tod) => ({
  // v2 square-props.json keys (only the ones this group owns)
  fps: { poof: FPS.poof },
  anchors: { poof: ANCHORS.poof, glow_warm: ANCHORS.glow_warm, glow_cool: ANCHORS.glow_cool },
  newStyle: {
    events: {
      tod,
      v2fps: V2_FPS,
      v2ms: V2_MS,
      fps: FPS,
      anchors: ANCHORS,
      timing: TIMING,
      tiers: {
        poof: 'A over the Storyteller feet (hide the sprite at poof_2, show at poof_3; pixel3d also plays the appear clip at poof_2)',
        glow: 'additive light stamps, banded (3 alpha steps); pixel3d uses PointLights instead',
        seat: 'Ag (ground, hidden under characters): the plaque sits 0.9 m toward the camera from the seat spot (clear of the feet); digits = kit tiny font at anchor - (0, 2), parchment on stone / nominee, redrawn above the rings',
        vote: 'Ag: nominee_ring + vote_pulse centred on the seat spot (around the feet); the hand = a 1-px shaft (gold by day, goldSh at night) + a 1-px goldLine shadow side, vote_tip_<dir> (5x5) at its end, vote_hub at the centre',
        hand: 'A: wrist at anchors.hand BESIDE the name label (right; left of it when the talk glyph is on the right), wrist on the label bottom row; tilt + 1-px bob at 2.5 fps while raised; hand_pop for 2 grid frames on raise; hand_lock_0..2 at 15 fps when counted; a counted ghost vote = hand_ghost_locked (gold hand, pale cuff) and the ghost turns ghost-spent (no halo) from that frame',
        vc: 'S: vc_face + vc_seat_<state> pips at radius ' + 23 + ', hand drawn from the centre to the current pip',
        caption: 'S: caption_end + caption_mid tile + flipped caption_end, glyph_<name> at the left, body text centred',
        veil: 'S, under every HUD element: veil_0..3 (Bayer 4/16..16/16) in a moving 72-px leading band: falls from the top (650 ms), lifts bottom first (1600 ms) (TIMING.night)',
        dawn: 'A (L.world) under labels: 2 grid frames of full cream cover (preset swap under it), then the light pulls back to the top edge with a dithered, wobbling leading edge, 3 alpha steps (TIMING.dawn)',
        death: 'toll_* Ag at the condemned feet; bell_* A over the label; wisp_* A from the body (execution) or the seat spot at head height (night death), dissolved before it overlaps a shown name label; reveal_* A at the ghost feet; candle_* A beside a dead seat',
        banner: 'S: banner_end + banner_mid tile + flipped banner_end, emblem_* centred above the title; top at y 42 (upper third, under the caption slot)',
        ghostSpent: 'ghost_halo_* only while the ghost vote is unspent (draw.js spentSeats / scheduleGhostSpent)',
      },
      dirs: DIRS8,
      notes: {
        poof: 'v2 14 fps -> 15 fps (2 grid frames per drawing, 400 ms total).',
        nightFall: 'v2 cam.fadeOut(650)+fadeIn(1600) -> a veil descending from the top in 4 dither levels (650 ms, 15 fps), then lifting bottom first behind the same moving band (1600 ms, 10 fps). The scene swaps to the night preset while fully covered.',
        dawn: 'v2 cam.flash(900, 70,40,50) -> 2 frames of cream cover (hides the preset swap), then light pulling back to the far (top) edge: violet in the top 6 % rows, rose to 15 %, gold to a dithered, wobbling edge that moves up every 2 frames, alpha 96/64/36; drawn under the labels.',
        hands: 'v2 colours kept: parchment + gold cuff = raised (not counted yet), solid gold = locked yes; hand_ghost = a ghost spending its vote.',
        nonGraphic: 'Executions and night deaths show a toll, a dim and the ghost rising: no gore, no hurt flash.',
      },
    },
  },
});

export default {
  image: 'events.png',
  width: 256,
  v2: 'square-props.json',
  only: (n) => /^(poof_|glow_)/.test(n),
  async frames({ tod }) { return buildFrames(tokens(tod)); },
  meta({ tod }) { return eventsMeta(tod); },
};
