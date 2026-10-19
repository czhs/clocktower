// life wind (owner: life agent): cloth in the town breeze. The dais' two town banners are part of the dais' merged
// solid mesh (no API, docs/TOWN.md §4), so their cloth vertices are found once by position (dais-local: the boxes
// between each pole and the free edge under the crossbar) and re-posed on a stepped 3-drawing flutter (3 fps,
// 0-1-2-1): the hem lifts downwind (+x, the shared WIND) and ripples toward the camera, the top stays on the bar.
// Only positions change (the outline / shadow passes use the same geometry); one rewrite per drawing change.
// CONTRACT-REQUEST (props): stall awnings / bunting need a wind(t) API or awning anchors to join this flutter.
import { step } from './util.js';

// drawings: [dx (downwind, m at the hem), dz (toward the camera at the hem), ripple phase]
const POSES = [[0.03, 0.02, 0.0], [0.08, 0.07, 1.9], [0.13, 0.1, 3.6]];
const CYCLE = [0, 1, 2, 1];

export function createBannerFlutter(daisPiece, { fps = 3, phase = [0.0071,0,0.0043] } = {}) {
  const mesh = daisPiece?.group?.children?.find((o) => o.userData?.layer === 'solid');
  const pos = mesh?.geometry?.getAttribute('position');
  if (!pos) return null;
  // the crossbar top (highest vertex in the banner columns) sets the cloth top; cloth hangs ~1.0 m below it
  const inCol = (x, z) => Math.abs(x) > 0.545 && Math.abs(x) < 1.02 && z > -1.85 && z < -1.7;
  let barTop = -1;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i); if (inCol(x, z) && y < 4) barTop = Math.max(barTop, y); }
  if (barTop < 0) return null;
  const yTop = barTop - 0.068, yBot = yTop - 1.0;
  const idx = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (inCol(x, z) && y <= yTop + 0.003 && y > yBot - 0.2) idx.push(i);
  }
  if (!idx.length) return null;
  const orig = idx.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  let last = -1;
  const apply = (k) => {
    const [ax, az, ph] = POSES[k];
    idx.forEach((i, j) => {
      const [x, y, z] = orig[j];
      const h = Math.min(1, Math.max(0, (yTop - y) / (yTop - yBot)));
      const d = (Math.abs(x) - 0.53) / 0.48;
      const w = Math.pow(h, 1.4);
      // moved vertices get a fixed sub-texel phase (like the town's ANTI_TIE) so a re-posed edge never lands on a
      // texel boundary (crawl A/B: 4 px -> 0 on a whole-texel pan)
      const m = w > 1e-4 ? 1 : 0;
      pos.setXYZ(i, x + ax * w + m * phase[0], y + 0.02 * w * Math.sin(ph + d * 2.0) + m * phase[1], z + az * w * (0.55 + 0.45 * Math.sin(ph + d * 3.1)) + m * phase[2]);
    });
    pos.needsUpdate = true;
  };
  return {
    count: idx.length,
    update(t) {
      const k = CYCLE[Math.floor(step(t, fps) * fps + 1e-6) % CYCLE.length];
      if (k !== last) { last = k; apply(k); }
    },
  };
}
