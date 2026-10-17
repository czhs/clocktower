// Probe atlas (portraits group, dev only): icon framing sweep for the weak ids (scale x nudge), + the feature masks.
// tools/uibake.sh portraits:portraits-probe -> shots/ui-portraits/bake/portraits-probe-sheet.png
import { renderCast } from './render.js';
import { PPM } from './style.js';
import { headBoxes, frameBox, bust, boostFeatures, makeIcon, ICON_FIT, FEATURE_MARKS } from './bake.js';

const IDS = ['rabbit', 'greenting', 'chonk', 'frog', 'moth'];
const PPMS = [12, 14, 16, 18, 20, 22, 24];
const NUDGES = [-3, -2, -1, 0, 1, 2];

export default {
  image: 'portraits-probe.png',
  width: 1024,
  async frames({ engine, kit }) {
    const big = { w: 96, h: 100, fx: 48, fy: 94 };
    const marks = await renderCast(engine, { ids: IDS, variant: 'idle', ppm: PPM, mark: ['@head'] });
    const hb = headBoxes(marks);
    const out = [];
    for (const p of PPMS) {
      const R = await renderCast(engine, { ids: IDS, variant: 'idle', ppm: p, crop: big });
      const MK = await renderCast(engine, { ids: IDS, variant: 'idle', ppm: p, crop: big, mark: FEATURE_MARKS });
      for (const id of IDS) {
        const box = frameBox(hb[id], R[id], null, p, 12, ICON_FIT);
        const row = new kit.PixelImage(NUDGES.length * 14 * 2 + 30, 14);
        NUDGES.forEach((n, i) => {
          const a = bust(R[id].frames[0], box.x, box.y, 12, 12, [0, n]);
          row.blit(makeIcon(a.clone()), i * 14, 1);
          const b = boostFeatures(a, bust(MK[id].frames[0], box.x, box.y, 12, 12, [0, n]));
          row.blit(makeIcon(b), NUDGES.length * 14 + 4 + i * 14, 1);
        });
        row.blit(bust(MK[id].frames[0], box.x, box.y, 12, 12, [0, 0]), NUDGES.length * 28 + 10, 1);
        out.push([`${id}_${p}`, row]);
      }
    }
    return out;
  },
};
