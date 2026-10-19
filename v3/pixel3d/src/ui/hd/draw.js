// D=2 runtime helpers (owner: UI lead; docs/UI.md "Density"): how a live page draws the HD art into the L.hd tiers.
// The markers group's timing (src/ui/markers/draw.js: drop curve, removal dissolve, bob, fan) on HD sprites and HD
// anchors, plus the cached-piece blit every HUD element uses. Pure functions of the stage time (deterministic).
//
//   fastBlit(dst, src, x, y)                     copy a cached sprite into a (tracked) layer image + mark its band
//   drawPlacePinHD(L, {p, color, icon, iconKey, age, removeAt, settled, still, hover})   depth-tested place pin
//   drawPersonPinsHD(L, {cx, labelTopHD, pins: [{color, icon, iconKey, age, removeAt, settled}], t, still, hover})
// (wave 1, markers at D=2) shadow, landing sparkle and the remove badge are the markers group's HD frames
// (src/ui/markers/hd.js markerFramesHD), no longer the 1x frames x2; an icon with `.hd` (portraits loader {hd: true})
// goes into the socket as its 24x24 HD re-render.
//   labelHD(L, worldPoint, name, variant, T)     a name label on L.hd.world (indicators art through the world view)
// L = the layer object with L.hd (createUILayers(engine, {density: 2})); positions come from L.hd.at() (HD px).
import { PixelImage, dissolve, frameAt } from '../kit.js';
import { pinFall, pinRemoval, TIMING as MT } from '../markers/draw.js';
import { markerFramesHD } from '../markers/hd.js';
import * as IA from '../indicators/art.js';
import { pinWithIconHD, ANCHORS_HD } from './art.js';

/** Copy a cached sprite into a layer image (opaque texels replace; partial alpha goes through set()); marks the band. */
export function fastBlit(dst, src, x, y) {
  x |= 0; y |= 0;
  const W = dst.w, H = dst.h, sw = src.w, sd = src.data, dd = dst.data;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(H, y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
      const a = sd[si + 3];
      if (!a) continue;
      if (a === 255 || !dd[di + 3]) { dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = a; }
      else dst.set(xx, yy, [sd[si], sd[si + 1], sd[si + 2], a]);
    }
  }
  dst.mark?.(x0, y0, x1 - 1, y1 - 1);
}
const _up = new WeakMap();
/** A 1x sprite block-scaled x2 (cached per sprite): the compat path for marker frames without HD art (shadow, sparkle). */
export function up2(im) { let v = _up.get(im); if (!v) { v = new PixelImage(im.w * 2, im.h * 2); v.blit(im, 0, 0, { scale: 2 }); _up.set(im, v); } return v; }

/**
 * A place pin at world point p on the HD depth tier (L.hd.useDepth() once in setup): the markers HD shadow + landing
 * sparkle (src/ui/markers/hd.js) and the HD pin with the dropper's portrait in its socket (icon: an image with `.hd` =
 * its 24x24 HD icon, the sharpest; a 24x24 image 1:1; a 12x12 icon x2). Timing = markers drawPlacePin (v2 DROP_MS /
 * POP_MS); offsets in art px (x d). hover: the HD remove badge. Returns false when gone.
 */
export function drawPlacePinHD(L, { p, color, icon = null, iconKey = '', age, removeAt = null, settled = false, still = false, hover = false }) {
  const H = L.hd, T = L.tok, d = H.d;
  if (age < 0) return true;
  const k = pinRemoval(age, removeAt);
  if (k === null) return false;
  const { yOff, spark } = pinFall(settled ? 99 : age, still);
  const q = H.at(p), dep = H.depthOf(p), FH = markerFramesHD(T);
  H.putDepth(FH.get('pin_shadow'), q.x - ANCHORS_HD.pin_shadow.x, q.y - ANCHORS_HD.pin_shadow.y, dep + 0.02, k);
  if (spark >= 0) H.putDepth(FH.get(`pin_drop_${spark}`), q.x - ANCHORS_HD.pin_drop.x, q.y - ANCHORS_HD.pin_drop.y, dep + 0.02);
  const pin = pinWithIconHD(color, icon, T, iconKey);
  H.putDepth(pin, q.x - ANCHORS_HD.pin.x, q.y + yOff * d - ANCHORS_HD.pin.y, dep, k);
  if (hover && !k) H.putDepth(FH.get('pin_remove'), q.x - ANCHORS_HD.pin.x + 15 * d - ANCHORS_HD.pin_remove.x, q.y - ANCHORS_HD.pin.y + 2 * d - ANCHORS_HD.pin_remove.y, dep - 0.01);
  return true;
}
/**
 * Pins over a person's name on L.hd.world: tip 1 art px above the label box (labelTopHD = the HD label box top),
 * fanned like markers drawPersonPins (no rotation), 1-px bob at 2 fps (x d), drop + its HD landing sparkle, removal
 * dissolve; hover = the index of the pin showing the HD remove badge (-1 none).
 */
export function drawPersonPinsHD(L, { cx, labelTopHD, pins, t, still = false, hover = -1 }) {
  const H = L.hd, T = L.tok, d = H.d, n = pins.length, mid = (n - 1) / 2, spread = Math.min(0.62, 2.4 / Math.max(1, n));
  const FH = markerFramesHD(T);
  let badge = null;
  pins.forEach((pp, i) => {
    if (pp.age < 0) return;
    const k = pinRemoval(pp.age, pp.removeAt);
    if (k === null) return;
    const kk = i - mid;
    const dx = n > 1 ? Math.round(kk * 18 * spread) : 0, dy = n > 1 ? Math.round(Math.abs(kk) * 1.5) : 0;
    const bob = still ? 0 : frameAt(t + i * 0.65, 2, 4, { seq: [0, 0, 1, 1] });
    const { yOff, spark } = pinFall(pp.settled ? 99 : pp.age, still);
    let src = pinWithIconHD(pp.color, pp.icon, T, pp.iconKey);
    const x = cx + dx * d - ANCHORS_HD.pin.x, y = labelTopHD - d + (dy - bob + yOff) * d - ANCHORS_HD.pin.y;
    if (k > 0) { src = src.clone(); dissolve(src, k, x, y); }
    fastBlit(H.world, src, x, y);
    if (spark >= 0) fastBlit(H.world, FH.get(`pin_drop_${spark}`), cx + dx * d - ANCHORS_HD.pin_drop.x, labelTopHD - d + dy * d - ANCHORS_HD.pin_drop.y);
    if (hover === i && !k) badge = [x + 15 * d - ANCHORS_HD.pin_remove.x, y + 2 * d - ANCHORS_HD.pin_remove.y];
  });
  if (badge) fastBlit(H.world, FH.get('pin_remove'), badge[0], badge[1]);   // over the whole fan (a later pin never hides it)
}
const _labels = new Map();
/**
 * A name label (indicators art: body@2 glyphs in a 2-px labelLine ring) centred over world point `head` on L.hd.world,
 * IA.LABEL_DY art px above it (as the 1x label). Cached per name + variant + token set. Returns its HD box.
 */
export function labelHD(L, head, name, variant, T, { top: top0 = null, x: x0 = null } = {}) {
  // (demo, additive 2026-10-17) opts.x: the HD x of the label's centre instead of the head's (the demo clamps labels
  // inside the view's edges and de-collides them); null = today's behaviour
  // (demo density adoption, additive) opts.top: the HD label top (the label's drawText y) instead of head + LABEL_DY
  // (the demo clamps labels near the top edge inward); the cache key also carries the ghost ink
  const H = L.hd, d = H.d, key = `${name}|${variant}|${T.labelText}|${T.labelLine}|${variant === 'ghost' ? T.ghost : ''}|${d}`;
  let lab = _labels.get(key);
  if (!lab) {
    const w = 160, h = 14, im = new PixelImage(w * d, h * d), v = H.view(im);
    IA.label(v, w >> 1, 2, name, variant, T);
    const bb = im.bbox() ?? { x: 0, y: 0, w: 1, h: 1 };
    lab = { im: im.crop(bb.x, bb.y, bb.w, bb.h), dx: bb.x - (w >> 1) * d, dy: bb.y - 2 * d };
    _labels.set(key, lab);
    if (_labels.size > 200) _labels.delete(_labels.keys().next().value);
  }
  const q = H.at(head), top = top0 ?? q.y + IA.LABEL_DY * d, cx = x0 ?? q.x;
  fastBlit(H.world, lab.im, cx + lab.dx, top + lab.dy);
  return { x: cx + lab.dx, y: top + lab.dy, w: lab.im.w, h: lab.im.h, top };
}
export { MT as MARKER_TIMING };
