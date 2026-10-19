// Density wave 2 entry point (docs/UI-HD-WAVE2.md): one call that turns on every wave-2 HD path for a token set, plus
// the A-HD helpers the demo needs for the events world FX. Pure JS (no three.js); idempotent; 1x output unchanged.
//
//   prepareWave2HD(T)           = prepareHD(T) (density round) + prepareHudHD() + prepareEventsHD(T) + prepareEmotesHD(T)
//   worldLayerHD(LL)            an L-like object whose `world` is L.hd.worldView and whose `at(p)` returns HD LOGICAL px
//                               (L.hd.at(p) / L.hd.d): put(LW.world, F, name, ...) / EV.drawPoof(LW, ...) / EV.drawWisp(LW, ...)
//                               draw the HD frames at the right place at every pixel scale. `ground` stays the 1x L.ground.
//   drawExecutionFxHD(hud, LL, F, m, t0, {t, still})   EV.drawExecution(..., {layer: 'fx'}) with the bell / wisp / reveal
//                               on the HD world tier and the tolls on the 1x ground (keep layer 'dim' on the 1x LL).
import { prepareHD } from './art.js';
import { prepareHudHD } from './hud.js';
import { prepareEventsHD } from './events.js';
import { prepareEmotesHD } from './emotes.js';
import * as EV from '../events/draw.js';
import * as A from '../events/art.js';
import { frameAt } from '../kit.js';

export { prepareHudHD, prepareEventsHD, prepareEmotesHD };
/** Every wave-2 HD path on (and the density round's sprites): call once per frame / token set; cheap after the first. */
export function prepareWave2HD(T, { swatchIcon = 'dot' } = {}) {
  prepareHD(T, { swatchIcon });
  prepareHudHD();
  prepareEventsHD(T);
  prepareEmotesHD(T);
}
/** HD logical px of world point p (L.hd.at / d, rounded): where a view-drawn sprite's anchor goes. */
export const atHD = (LL, p) => { const q = LL.hd.at(p), d = LL.hd.d; return { x: Math.round(q.x / d), y: Math.round(q.y / d) }; };
/** An L-like layer object for the HD world tier (see the header). */
export function worldLayerHD(LL) {
  return Object.create(LL, { world: { get: () => LL.hd.worldView }, at: { value: (p) => atHD(LL, p) }, hdWorld: { value: true } });
}
/**
 * The execution FX at D=2 (the 'fx' layer of EV.drawExecution): tolls on the 1x ground (L.at), the swinging bell over
 * the label, the wisp from the body and the ghost-reveal burst on the HD world tier (HD frames, HD logical px). Same
 * timeline (EV.TIMING.execution). Returns what EV.drawExecution returns.
 */
export function drawExecutionFxHD(hud, LL, F, m, t0, { t = LL.t, still = false } = {}) {
  const X = EV.TIMING.execution, k = EV.gridK(t - t0);
  const out = { ghost: k >= X.ghostAtF, dying: k >= X.dieAtF, k };
  if (k < 0 || !m) return out;
  const feet = LL.at(m.feet());
  for (const a of X.tollsAtF) { const dr = Math.floor((k - a) / 3); if (k >= a && dr < 4) EV.put(LL.ground, F, `toll_${dr}`, feet.x, feet.y, 'toll'); }
  const LW = worldLayerHD(LL), D = LL.hd.d, kk = LL.hd.k;
  const toHD = (y1x) => Math.round(y1x * kk / D);           // a 1x world row -> HD logical row (same scene point)
  const fH = LW.at(m.feet()), hH = LW.at(m.head());
  const be = EV.env(k, X.bellOutAtF);
  if (be) {
    const y = toHD(EV.stackTopOf(hud, LL, m) - 1);
    const im = F[`bell_${still ? 1 : frameAt(t - t0, A.FPS.bell, 3, { seq: [0, 1, 2, 1] })}`];
    if (be.pop && !still) LW.world.blit(im, hH.x - 6, y - im.h + 2);
    else LW.world.blit(be.k ? EV.dissolved(im, be.k) : im, hH.x - 6, y - im.h);
  }
  if (k >= X.wispAtF) EV.drawWisp(LW, F, Math.floor((k - X.wispAtF) / 3), fH.x, fH.y - EV.WISP_LIFT, toHD(EV.labelTopOf(hud, LL, m)));
  const rd = Math.floor((k - X.ghostAtF) / 2);
  if (k >= X.ghostAtF && rd < 4 && !still) EV.put(LW.world, F, `reveal_${rd}`, fH.x, fH.y - 6, 'reveal');
  return out;
}
