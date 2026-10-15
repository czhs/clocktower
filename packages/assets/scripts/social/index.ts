// Social signals sheet (generated/social.png + social.json): map pins, character head icons and
// the POINT emote. v1 procedural pixel art, deterministic. Built from cast.png (icons are cropped
// from every character's 'down' idle frame), so it must run after the cast is generated.
//
// Manifest contract (consumed by the client):
//   { image: 'social.png', width, height,
//     frames: { <name>: {x,y,w,h} },
//     meta: {
//       iconSize: 12,                       // icon_<castId> frames are iconSize x iconSize round portraits
//       icons: string[],                    // every cast id that has an icon_<id> frame
//       pinColors: PinColor[],              // = PIN_COLORS; pin_<color> frames exist for each
//       pinColorHex: { <color>: '#rrggbb' },// swatch colour for UI buttons
//       pinIcon: { x, y, r, left, top },    // icon disc in the pin frame: centre (x,y), radius r;
//                                           //   draw icon_<id> at (left, top) of the pin frame
//       anchors: { pin, pin_shadow, pin_drop, point, ping, icon }: {x,y} each — the pixel that sits
//                on the placement point (pin: the needle tip; pin_shadow / ping / pin_drop: the
//                ground spot; point: the fist centre; icon: the centre),
//       fps: { pin_drop, point, ping },
//       point: { dirs: PointDir[], frames: 3, sequence: [0,1,2,1], vectors: { <dir>: [x,y] },
//                size, offset },           // see place.point
//       place: { <name>: string }           // placement notes
//     } }
import { PIN_COLORS } from '@ct/protocol';
import { CAST } from '../../src/cast.js';
import { Img } from '../lib/img.js';
import { buildIcons, ICON } from './icons.js';
import { buildPins, DROP_ANCHOR, PIN_ANCHOR, PIN_BASE, PIN_ICON, PIN_SHADOW_ANCHOR } from './pins.js';
import { buildPoint, PING_ANCHOR, POINT_CENTER, POINT_DIRS, POINT_SIZE, POINT_VEC } from './point.js';
import { reviewSheet } from './review.js';

type Rect = { x: number; y: number; w: number; h: number };

function pack(frames: [string, Img][], width: number): { img: Img; rects: Record<string, Rect> } {
  const PAD = 1;
  const rects: Record<string, Rect> = {};
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const [n, i] of frames) {
    if (x + i.w + PAD > width) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    rects[n] = { x, y, w: i.w, h: i.h };
    x += i.w + PAD;
    rowH = Math.max(rowH, i.h);
  }
  const img = new Img(width, Math.ceil((y + rowH + PAD) / 4) * 4);
  for (const [n, i] of frames) img.copy(i, rects[n]!.x, rects[n]!.y);
  return { img, rects };
}

export interface CastManifestLike {
  sheets: Record<string, { x: number; y: number }>;
  frameWidth: number;
  frameHeight: number;
}

/** `opts.review` (default true) also renders the review sheet (slow-ish; skip it in normal builds). */
export function buildSocial(castImg: Img, castManifest: unknown, opts: { review?: boolean } = {}): { img: Img; manifest: unknown; review?: Img } {
  const cm = castManifest as CastManifestLike;
  const { icons, crops } = buildIcons(castImg, cm);
  const frames: [string, Img][] = [];
  frames.push(...buildPins());
  frames.push(...buildPoint());
  for (const c of CAST) frames.push([`icon_${c.id}`, icons.get(c.id)!]);
  const { img, rects } = pack(frames, 256);
  const manifest = {
    image: 'social.png',
    width: img.w,
    height: img.h,
    frames: rects,
    meta: {
      iconSize: ICON,
      icons: CAST.map((c) => c.id),
      pinColors: PIN_COLORS,
      pinColorHex: PIN_BASE,
      pinIcon: PIN_ICON,
      anchors: {
        pin: PIN_ANCHOR,
        pin_shadow: PIN_SHADOW_ANCHOR,
        pin_drop: DROP_ANCHOR,
        point: POINT_CENTER,
        ping: PING_ANCHOR,
        icon: { x: ICON / 2, y: ICON / 2 },
      },
      fps: { pin_drop: 14, point: 8, ping: 10 },
      point: {
        dirs: POINT_DIRS,
        frames: 3,
        sequence: [0, 1, 2, 1],
        vectors: POINT_VEC,
        size: POINT_SIZE,
        offset: 14,
      },
      headCrops: crops,
      place: {
        pin: 'Place-pin: draw pin_shadow (anchor) on the spot, then pin_<color> with anchors.pin on the spot, then icon_<castId> at (pinIcon.left, pinIcon.top) inside the pin frame. Person-pin: same, with the tip ~2 px above the target\'s head (a gentle 1 px bob looks nice; no shadow). Play pin_drop_0..3 once at the spot when a pin lands (fps.pin_drop).',
        point:
          'Pick the dir whose vector is closest to (target - emoter). Draw point_<dir>_<f> with anchors.point at emoterHead + vector * point.offset (emoterHead ~ feet - 26 px), looping point.sequence at fps.point for EMOTE_POINT_MS. Loop ping_0..3 at the pointed spot (anchors.ping) at fps.ping; for a person target, at their feet.',
        icon: 'icon_<castId> is a round 12x12 portrait (transparent outside the disc). Also usable as a UI avatar; emote_point is the palette button icon.',
      },
    },
  };
  return { img, manifest, review: opts.review === false ? undefined : reviewSheet(frames, icons) };
}
