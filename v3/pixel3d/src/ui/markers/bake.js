// Markers atlas (owner: markers group; docs/UI.md §3.4): out/ui/markers.{png,json}, the drop-in for the v2 social.png
// marker frames (pin_<color> x8, pin_shadow, pin_drop_0..3, point_<dir>_<0..2> x24, ping_0..3) + new-style extras.
//   tools/uibake.sh markers [--strict]            (day/golden token set; night: tools/uibake.sh markers:markers-night)
import { tokens, PIN_COLORS, PIN_HEX } from '../kit.js';
import { buildFrames, ANCHORS, FPS, V2_FPS, POINT, PIN_ICON, PIN_ART } from './art.js';
import { TIMING } from './draw.js';

export const markersMeta = (tod) => ({
  // v2 meta keys (social.json) kept verbatim where the art did not change them
  iconSize: 12,
  pinColors: PIN_COLORS,
  // v2 values verbatim (DOM swatches keep their colour); the baked body mids are newStyle.markers.pinMid
  pinColorHex: Object.fromEntries(PIN_COLORS.map((c) => [c, PIN_HEX[c]])),
  pinIcon: PIN_ICON,
  anchors: ANCHORS,
  // grid-snapped (v2 14/8/10 -> 15/7.5/10; 7.5 = a hold of 4 grid frames). A Phaser port passes them as frameRate
  // (fractional rates are fine there); v2 rates in newStyle.markers.v2fps
  fps: FPS,
  point: POINT,
  place: {
    pin: 'Place-pin: draw pin_shadow (anchors.pin_shadow) on the spot, then pin_<color> with anchors.pin on the spot, then icon_<castId> at (pinIcon.left, pinIcon.top) inside the pin frame, on the INNER disc only (radius 5: leave the 1-px socket ring of the frame visible). Depth-sort place pins with characters/props by the spot (pixel3d: depth-tested pass, src/ui/markers/pinPass.js). Person-pin: same without the shadow, tip 1 px above the target\'s name label box, 1 px bob at 2 fps, fanned (never rotated). Play pin_drop_0..3 once at the spot when a pin lands (fps.pin_drop, held 2 grid frames each), under the pin body.',
    point: 'Pick the dir whose vector is closest to (target - emoter). Draw point_<dir>_<f> with anchors.point at emoterHead + vector * point.offset (pixel3d emoterHead = feet + 0.72 x height; v2 feet - 26 px), looping point.sequence at fps.point for EMOTE_POINT_MS. Loop ping_0..3 at the pointed spot (anchors.ping) at fps.ping, under characters; for a person target at their feet. Trail dots (trail_0/1) every 6 px from the fingertip to the aim point, drawn BELOW name labels and chat bubbles; the finger above them.',
    icon: 'icon_<castId> is a round 12x12 portrait (transparent outside the disc), baked by the portraits group (out/ui/portraits.json). Also usable as a UI avatar; emote_point (emotes group) is the palette button icon.',
  },
  newStyle: {
    markers: {
      tod,
      v2fps: V2_FPS,
      timing: TIMING,
      tiers: {
        pin: 'place: W-billboard (depth-tested pin pass, order 301: over L.ground decals, under every L.world texel) / person: A (L.world)',
        pin_shadow: 'with the place pin (depth-tested, under its body)', pin_drop: 'with the place pin (under its body); person pins: A',
        point: 'A (z 30)', ping: 'Ag (L.ground)', trail: 'A below labels/bubbles (z 15)', pin_remove: 'with its pin', ping_mark: 'A', pick: 'A',
      },
      pinMid: Object.fromEntries(PIN_COLORS.map((c) => [c, PIN_ART[c].mid])),
      pinMidNote: 'baked body mid per colour; equal to pinColorHex except white (#DCD3C4: v2 #ece6da was brighter than the cream rim/text tokens, so the ramp keeps the cream highlight on top)',
      pinIconInner: 'icons go on the 12x12 disc minus its 1-px edge (radius 5); the edge is the socket ring (upper-left parchmentSh, lower-right parchmentHi; white pin: its own line/shade) that separates any icon from any pin colour',
      extras: {
        pin_remove: '9x9 remove badge (v2 art.ts BADGE), anchor = centre; shown on hover/tap of your own pin, centre at pin frame (15,2)',
        trail_0: 'trail dot (bright), every 6 px from the fingertip to the aim point, marching 1 px per 7.5 fps step',
        trail_1: 'trail dot (dim), the first dot next to the hand',
        ping_mark: 'chevron over a pointed PLACE, tip 4 px above the spot, 1 px bob at 2 fps',
        pick_0: 'Storyteller pick crosshair (v2 gameplay stagePick), frames 0..2, sequence [0,1,2,1] at 7.5 fps; label right-below',
      },
      emoterHead: 'feet + 0.72 x character height (v2: feet - 26 px)',
      personAim: 'target feet + 0.4 x height (v2: feet - 14 px)',
      personPin: 'tip 1 px above the name label box (label top = head anchor - 11); fan dx = k * 18 * min(.62, 2.4/n), dy = |k| * 1.5, never rotated',
    },
  },
});

export default {
  image: 'markers.png',
  width: 256,
  v2: 'social.json',
  only: (n) => /^(pin|point|ping)/.test(n),
  async frames({ tod }) { return buildFrames(tokens(tod)); },
  meta({ tod }) { return markersMeta(tod); },
};
