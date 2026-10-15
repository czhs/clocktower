// house-5 — the Apothecary (west-facing, door in the left side wall).
// Cream limewash with bottle-green timbers under a clipped (jerkinhead) teal-slate roof. The gable
// end shows a projecting bay window crammed with glowing coloured bottles, drying herb bundles
// under the clipped hip, a leaded diamond-pane attic light and a mortar-&-pestle plaque; a
// verdigris still-flue with a witch-hat cowl stands in for a chimney.
import type { DoorSpec } from '../buildings.js';
import { pot, wallLantern } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { dpick, hash, Img, mix } from '../lib/img.js';
import { barge, finish, glassWindow, P, plaster, put, slope, texPoly, type V2, West, westDoor, westStep } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const TIMBER = ['#0e1812', '#16241a', '#203424', '#2c4630', '#3c5c3e'];
const BOTTLES = ['#c0304a', '#3f9a5a', '#4a6ec8', '#9a4ab4', '#e8a030', '#38a0a0'];

const art: HouseArt = (b, _style, seed) => {
  const w = new West(b, 16);
  const { img, W, H, SW, R, windows } = w;
  const wallH = 30;
  const wallTop = H - wallH; // first wall row of the front
  const roof = P.tealSlate;

  // --- side wall (lit): plaster, green corner timbers, stone plinth
  {
    const tex = new Img(SW, wallH);
    plaster(tex, 0, 0, SW, wallH, P.cream, seed + 11, (i) => (i > SW - 3 ? -0.1 : 0));
    for (let j = 0; j < wallH; j++) for (const i of [0, 1]) tex.set(i, j, dpick(TIMBER, i === 0 ? 0.5 : 0.75, i, j));
    for (let i = 0; i < SW; i++) for (const j of [1, 2]) tex.set(i, j, dpick(TIMBER, j === 1 ? 0.8 : 0.45, i, j));
    stonework(tex, 0, wallH - 4, SW, 4, P.stone, '#141118', { rh: 4, sw: 6, seed: seed + 3 });
    w.sideTex(tex, 0, 0.04);
  }
  // --- front (gable-end) wall
  plaster(img, SW, wallTop, W - SW, wallH, P.cream, seed, (i) => (i < 3 ? 0.08 : i > W - SW - 4 ? -0.12 : 0));
  stonework(img, SW, H - 4, W - SW, 4, P.stone, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  for (let y = wallTop; y < H - 4; y++) {
    img.set(SW, y, dpick(TIMBER, 0.85, SW, y));
    img.set(SW + 1, y, dpick(TIMBER, 0.55, SW + 1, y));
    img.set(W - 2, y, dpick(TIMBER, 0.4, W - 2, y));
    img.set(W - 1, y, dpick(TIMBER, 0.2, W - 1, y));
  }
  for (let x = SW; x < W; x++) {
    img.set(x, wallTop, dpick(TIMBER, 0.8, x, wallTop));
    img.set(x, wallTop + 1, dpick(TIMBER, 0.4, x, wallTop + 1));
  }

  // --- the bottle bay window (projecting, three-sided)
  const cx = SW + Math.floor((W - SW) / 2); // 43
  {
    const fw = 15; // front face
    const sw = 3; // each angled cheek
    const x0 = cx - Math.floor(fw / 2);
    const top = wallTop + 6; // glass top
    const gh = 13;
    // stone base under the bay
    for (let j = 0; j < 6; j++)
      for (let i = -sw; i < fw + sw; i++) {
        const x = x0 + i;
        const y = top + gh + 1 + j;
        const cheek = i < 0 || i >= fw;
        img.set(x, y, dpick(P.dstone, (j === 0 ? 0.92 : 0.5) - (cheek ? (i < 0 ? 0.08 : 0.3) : 0) + (hash(x, y, 5) - 0.5) * 0.12, x, y));
      }
    // glass: warm dim shop light behind three shelves of bottles
    for (let j = 0; j < gh; j++)
      for (let i = -sw; i < fw + sw; i++) {
        const x = x0 + i;
        const y = top + j;
        const cheek = i < 0 || i >= fw;
        const v = 0.42 - j * 0.015 + (cheek ? -0.2 : 0) + (j % 4 === 3 ? 0.12 : 0);
        img.set(x, y, dpick(['#1a0c0a', '#3a1c10', '#6e3a18', '#a8601e', '#d89038'], v, x, y));
      }
    for (const sj of [6, 12]) for (let i = -sw; i < fw + sw; i++) img.set(x0 + i, top + sj, mix(P.beam[3]!, '#000000', i < 0 || i >= fw ? 0.3 : 0));
    // bottles and flasks standing on each shelf: round flasks, tall bottles, little vials
    for (const [k, sj] of [6, 12].entries()) {
      let i = -sw + 1 + k;
      let n = 0;
      while (i < fw + sw - 2) {
        const c = BOTTLES[(n * 2 + k * 3 + seed) % BOTTLES.length]!;
        const hi = mix(c, '#fff6e0', 0.5);
        const lo = mix(c, '#0b0714', 0.3);
        const kind = (n + k) % 3;
        const x = x0 + i;
        const y = top + sj - 1; // standing row
        if (kind === 0) {
          // round flask: 3x3 body, 1px neck, cork
          img.rect(x, y - 2, 3, 3, c);
          img.set(x, y - 2, hi);
          img.vline(x + 2, y - 1, y, lo);
          img.set(x + 1, y - 3, c);
          img.set(x + 1, y - 4, '#c8b890');
          i += 4;
        } else if (kind === 1) {
          // tall bottle
          img.rect(x, y - 3, 2, 4, c);
          img.vline(x, y - 3, y - 1, hi);
          img.set(x + 1, y - 4, c);
          img.set(x + 1, y - 5, '#c8b890');
          i += 3;
        } else {
          // squat jar with a paper lid
          img.rect(x, y - 1, 2, 2, c);
          img.set(x, y - 1, hi);
          img.hline(x, x + 1, y - 2, '#e8dcc0');
          i += 3;
        }
        n++;
      }
    }
    // mullions + frame
    for (const i of [-sw - 1, -1, fw, fw + sw]) for (let j = -1; j <= gh; j++) img.set(x0 + i, top + j, i === -sw - 1 || i === fw + sw ? TIMBER[1]! : TIMBER[2]!);
    for (let i = -sw - 1; i <= fw + sw; i++) img.set(x0 + i, top + gh, TIMBER[3]!);
    // the lead-capped hood of the bay
    for (let j = 0; j < 4; j++)
      for (let i = -sw - 2 + (3 - j); i <= fw + sw + 1 - (3 - j); i++) {
        const x = x0 + i;
        const y = top - 4 + j;
        img.set(x, y, dpick(roof, j === 3 ? 0.08 : 0.82 - j * 0.2 + (i < fw / 2 ? 0.05 : -0.1), x, y));
      }
    // gilded little pestle finial on the hood
    img.set(cx, top - 5, P.brass[4]!);
    img.set(cx, top - 6, P.brass[3]!);
    windows.push({ x: cx, y: top + 6 }, { x: x0 - 1, y: top + 9 });
  }
  // potted herbs either side of the bay
  pot(img, SW + 3, H - 1, seed + 1);
  pot(img, W - 9, H - 1, seed + 3);

  // --- side door (green, arched, with a light), step, lantern, small back window
  const spec: DoorSpec = { w: 8, h: 20, arched: true, kind: 'window', hinge: 'left', paint: '#3e6a46', wreath: false, seed };
  const { d, x0: dx0 } = westDoor(w, spec, 2, 1, seed);
  westStep(w, dx0 - 1, dx0 + spec.w);
  {
    const lx = dx0 - 4;
    const ly = w.base(lx) - 4 - spec.h + 9;
    wallLantern(img, lx, ly, true);
    windows.push({ x: lx + 1, y: ly - 3 });
  }
  // a rack of herbs drying on the side wall, behind the lantern
  {
    const kinds = [P.leaf[3]!, '#8a7a3a', P.leaf[4]!, '#7a5a8a'];
    for (let x = 1; x <= 6; x++) img.set(x, w.base(x) - 24, P.beam[3]!);
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 2;
      const y = w.base(x) - 23;
      const c = kinds[(k + seed) % kinds.length]!;
      img.set(x, y, '#5a4a30');
      img.vline(x, y + 1, y + 4 + (k % 2), c);
      img.set(x - 1, y + 2, mix(c, '#fff1cc', 0.2));
      img.set(x + 1, y + 2, mix(c, '#0b0714', 0.3));
    }
    // a crate of empty bottles by the wall
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        const x = 1 + i;
        const y = w.base(x) - 3 + j - 1;
        img.set(x, y, dpick(P.beam, j === 0 ? 0.9 : 0.5 - (i > 4 ? 0.2 : 0), x, y));
      }
    for (const [i, c] of [[1, BOTTLES[1]!], [3, BOTTLES[2]!], [5, BOTTLES[0]!]] as const) {
      const x = 1 + i;
      const y = w.base(x) - 5;
      img.vline(x, y - 1, y, c);
      img.set(x, y - 2, '#c8b890');
    }
  }

  // --- roof: clipped gable (jerkinhead)
  const gh = 30;
  const apex: V2 = [cx - 0.5, wallTop - gh];
  const clip = 12; // rows clipped off the gable top by the little hip
  const eL: V2 = [SW - 2, wallTop + 1];
  const eR: V2 = [W + 1, wallTop + 1];
  const lit = 0.02;
  slope(img, eR, apex, R, roof, (ux, ly) => (ly % 4 === 3 ? -0.3 : (ux + Math.floor(ly / 4) * 3) % 6 === 0 ? -0.18 : 0), -0.1);
  slope(img, eL, apex, R, roof, (ux, ly) => (ly % 4 === 3 ? -0.3 : (ux + Math.floor(ly / 4) * 3) % 6 === 0 ? -0.18 : 0) + (hash(Math.floor((ux + (Math.floor(ly / 4) % 2) * 3) / 6), Math.floor(ly / 4), seed) - 0.5) * 0.22, lit);
  // eave shadow along the top of the side wall
  for (let x = 0; x < SW; x++) for (let j = 0; j <= 2; j++) img.blend(x, w.base(x) - wallH + 1 + j, '#05030a', 0.42);
  // gable wall (trapezoid under the clip)
  const yc = apex[1] + clip;
  const halfAt = (y: number) => ((y - apex[1]) / gh) * ((W - SW) / 2);
  texPoly(
    img,
    [
      [SW + 1, wallTop + 1],
      [apex[0] + 0.5 - halfAt(yc), yc],
      [apex[0] + 0.5 + halfAt(yc), yc],
      [W - 1, wallTop + 1],
    ],
    (t) => plaster(t, SW, yc, W - SW, wallTop - yc + 2, P.cream, seed + 7, (i) => (i < 4 ? 0.08 : i > W - SW - 5 ? -0.1 : 0)),
  );
  // the hip facet on top of the clipped gable (leaning back)
  {
    const rf: V2 = [apex[0] + R[0] * 0.1, apex[1] + R[1] * 0.1 - 1];
    const l: V2 = [apex[0] + 0.5 - halfAt(yc) - 2, yc + 1];
    const r: V2 = [apex[0] + 0.5 + halfAt(yc) + 2, yc + 1];
    img.poly([l, rf, r], (x, y) => {
      const t = (y - rf[1]) / (l[1] - rf[1]);
      const row = Math.floor((y - rf[1]) / 3);
      let v = 1.05 - t * 0.25 + (x < rf[0] ? 0.04 : -0.1);
      if ((y - Math.floor(rf[1])) % 3 === 2) v -= 0.22;
      else if ((x + row * 2) % 5 === 0) v -= 0.12;
      return dpick(roof, v, x, y);
    });
    for (let x = Math.ceil(l[0]); x <= r[0]; x++) img.set(x, yc + 1, roof[0]!);
    barge(img, rf, [l[0] + 1, l[1] - 1], roof, 2, -0.35);
    barge(img, rf, [r[0] - 1, r[1] - 1], roof, 2, -0.45);
  }
  // barge boards down both gable edges (painted green)
  const bL0: V2 = [apex[0] + 0.5 - halfAt(yc) - 1, yc + 1];
  const bR0: V2 = [apex[0] + 0.5 + halfAt(yc) + 1, yc + 1];
  barge(img, bL0, [SW - 2, wallTop + 2], TIMBER, 4, 0.05);
  barge(img, bR0, [W, wallTop + 2], TIMBER, 4, -0.15);
  img.blendRect(SW + 2, wallTop - 1, W - SW - 4, 1, '#05030a', 0.3);

  // herbs drying on a pole under the clipped hip
  {
    const py = yc + 3;
    const hw = Math.floor(halfAt(py)) - 3;
    img.hline(cx - hw, cx + hw, py, P.beam[3]!);
    img.hline(cx - hw, cx + hw, py + 1, P.beam[1]!);
    const kinds = [P.leaf[3]!, '#7a6a32', '#7a5a8a', P.leaf[4]!, '#9a7a3a'];
    let k = 0;
    for (let x = cx - hw + 1; x <= cx + hw - 1; x += 3, k++) {
      const len = 4 + ((k * 3) % 3);
      const c = kinds[(k + seed) % kinds.length]!;
      img.set(x, py + 2, '#5a4a30');
      img.rect(x - 1, py + 3, 3, len - 1, c);
      img.vline(x - 1, py + 3, py + 2 + len - 1, mix(c, '#fff1cc', 0.25));
      img.vline(x + 1, py + 3, py + 2 + len - 1, mix(c, '#0b0714', 0.35));
      img.set(x, py + 2 + len, mix(c, '#0b0714', 0.2));
    }
  }
  // leaded diamond-pane attic light + mortar-and-pestle plaque
  {
    const win = glassWindow(9, 8, { diamond: true, seed: seed + 5, frame: TIMBER[0] });
    const wy = yc + 11;
    put(img, win, (i, j) => [cx - 5 + i, wy + j]);
    windows.push({ x: cx, y: wy + 4 });
    img.rect(cx - 6, wy + 10, 13, 1, TIMBER[3]!);
    img.rect(cx - 6, wy + 11, 13, 1, TIMBER[1]!);
    // plaque (round, painted) to the right of the attic light
    const px = cx + 11;
    const py = wy + 4;
    img.ellipse(px, py, 4, 4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.62 ? dpick(P.brass, 0.7 - nx * 0.3 - ny * 0.3, x, y) : dpick(TIMBER, 0.55 - ny * 0.2, x, y)));
    // mortar bowl + pestle
    img.hline(px - 2, px + 1, py + 1, '#e8dcc0');
    img.hline(px - 1, px, py + 2, '#c8b890');
    img.set(px + 1, py - 2, '#e8dcc0');
    img.set(px, py - 1, '#e8dcc0');
    img.set(px - 3 + 6, py - 3, '#c8b890');
    // a twin plaque on the left: a green apothecary cross
    const qx = cx - 12;
    img.ellipse(qx, py, 4, 4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.62 ? dpick(P.brass, 0.7 - nx * 0.3 - ny * 0.3, x, y) : dpick(TIMBER, 0.55 - ny * 0.2, x, y)));
    img.hline(qx - 2, qx + 1, py - 1, '#5ec07a');
    img.hline(qx - 2, qx + 1, py, '#3f9a5a');
    img.vline(qx - 1, py - 3, py + 2, '#5ec07a');
    img.vline(qx, py - 3, py + 2, '#3f9a5a');
  }
  // ridge highlight
  {
    const rf: V2 = [apex[0] + R[0] * 0.1, apex[1] + R[1] * 0.1 - 1];
    for (let k = 0; k <= Math.abs(R[0]) * 0.9; k++) img.set(rf[0] - k, rf[1] - Math.floor((k + 1) / 2), roof[6]!);
  }

  // --- the still-flue: a verdigris copper pipe with an elbow and a witch-hat cowl
  let chim = null as { x: number; y: number } | null;
  {
    const u = 0.62;
    const bx = Math.round(apex[0] + R[0] * u) - 3;
    const by = Math.round(apex[1] + R[1] * u) + 7;
    const top = by - 22;
    for (let y = top + 6; y <= by; y++)
      for (let i = 0; i < 4; i++) img.set(bx + i, y, dpick(P.verdigris, (i === 0 ? 0.9 : i === 1 ? 0.65 : i === 2 ? 0.4 : 0.15) + ((y - top) % 6 === 0 ? -0.25 : 0), bx + i, y));
    // collar bands
    for (const yy of [by - 3, top + 12]) img.hline(bx - 1, bx + 4, yy, P.brass[3]!);
    // the cowl: a little conical hat on stilts
    img.set(bx, top + 5, P.iron[2]!);
    img.set(bx + 3, top + 5, P.iron[2]!);
    for (let j = 0; j < 5; j++)
      for (let i = -Math.floor(j * 0.7) - 1 + 1; i <= Math.floor(j * 0.7) + 3; i++) {
        const x = bx + i;
        const y = top + j;
        img.set(x, y, dpick(P.verdigris, 0.8 - (i - (bx + 1 - bx)) / 10 - j * 0.06, x, y));
      }
    img.set(bx + 1, top - 1, P.verdigris[3]!);
    img.set(bx + 2, top - 1, P.verdigris[2]!);
    img.set(bx + 1, top - 2, P.brass[4]!);
    chim = { x: bx + 2, y: top - 1 };
  }

  return finish(img, windows, d, 'left', chim);
};
export default art;
