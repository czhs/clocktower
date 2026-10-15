// Tinker Pell, the clock-fixer: a soft tan-olive snail with a big brown spiral shell, two eye stalks
// wearing tiny brass goggles, a little wrench held up front. No legs: it glides — the walk frames
// stretch and squash the foot (and wobble the stalks) instead of stepping.
import { CX, P, Sprite, litS, onRing, pose, ramp, stamp, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const SKIN = ramp('#c4b27a');
const SHELL = ramp('#a06a38');
const BRASS = '#a07a2c';
const STEEL = ramp('#9aa2b2');
const EYE = '#1a1020';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const sp = new Sprite();
  const stretch = f === 1 || f === 3 ? 1 : 0;
  const squash = f === 2 || f === 4 ? 1 : 0;
  const lift = -squash; // neck/shell rise 1 px while the foot gathers
  const face = v.c > -0.2;

  // ---- foot (a long slug along the forward axis)
  const footC = P(v, 0, -1.4 + stretch * 0.6);
  const footLen = 9.2 + stretch * 1.6 - squash * 0.8;
  const footHw = Math.sqrt((footLen * v.s) ** 2 + (4.6 * v.c) ** 2);
  const footTop = 33 + squash - stretch;
  const drawFoot = (l: import('./lib-b.js').Img) => {
      const cx = CX + footC.x;
      for (let y = footTop; y <= 37; y++) {
        const t = (y - footTop) / (37 - footTop);
        const hw = footHw * (0.75 + 0.25 * Math.sqrt(t)) ;
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          const s = (x + 0.5 - cx) / hw;
          if (Math.abs(s) > 1) continue;
          // the tail end tapers (behind), the front stays round
          const back = v.s > 0.3 ? -s : 0;
          if (back > 0.55 && y < footTop + Math.round((back - 0.55) * 8)) continue;
          let vv = litS(s) - 0.05 - (y === 37 ? 0.25 : 0);
          if (y === footTop) vv += 0.15;
          l.set(x, y, tone(SKIN, vv));
        }
      }
    };

  // ---- shell: an ellipsoid sitting on the back; the spiral is painted on its side face
  const shC = P(v, 0, -2.8);
  const R = 7.6;
  const shHw = Math.sqrt((R * v.s) ** 2 + (6.6 * v.c) ** 2);
  const shCy = 26.2 - 1.4 * Math.abs(v.c) + lift;
  const drawShell = () =>
    sp.layer((l) => {
      const cx = CX + shC.x;
      for (let y = Math.floor(shCy - R); y <= Math.ceil(shCy + R); y++)
        for (let x = Math.floor(cx - shHw); x <= Math.ceil(cx + shHw); x++) {
          const nx = (x + 0.5 - cx) / shHw;
          const ny = (y + 0.5 - shCy) / R;
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          const nz = Math.sqrt(1 - d);
          let vv = 0.52 + (-nx * 0.62 - ny * 0.78) * 0.42 + nz * 0.15;
          if (Math.abs(v.s) > 0.45) {
            // spiral on the side: r, theta in the shell's own plane (mirror-stable for the facing)
            const sx = nx * (v.s > 0 ? 1 : -1);
            const r = Math.sqrt(sx * sx + ny * ny);
            const th = Math.atan2(ny, -sx);
            const k = (((th / (2 * Math.PI) + r * 1.95) % 1) + 1) % 1;
            if (k < 0.22 && r > 0.12) vv -= 0.55;
            else if (k < 0.36) vv += 0.15;
            if (r < 0.14) vv += 0.25;
          } else {
            // seen end-on: whorl ridges as arcs
            const r = Math.sqrt(nx * nx * 0.5 + ny * ny);
            if (Math.abs(((r * 2.6) % 1) - 0.5) < 0.13 && ny > -0.8) vv -= 0.45;
          }
          l.set(x, y, tone(SHELL, vv));
        }
    });

  // ---- neck / head column
  const nk = P(v, 0, 3.6);
  const nTop = 21 + lift;
  const drawNeck = (l: import('./lib-b.js').Img) => {
      const cx = CX + nk.x;
      for (let y = nTop; y <= 35; y++) {
        const cap = y - nTop;
        const base = 3.1 + 0.4 * Math.abs(v.s);
        const hw = cap === 0 ? base - 1.6 : cap === 1 ? base - 0.6 : cap === 2 ? base - 0.15 : base + (y > 31 ? (y - 31) * 0.3 : 0);
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          const s = (x + 0.5 - cx) / hw;
          if (Math.abs(s) > 1) continue;
          l.set(x, y, tone(SKIN, litS(s) + 0.1 - cap * 0.01));
        }
      }
      if (face) {
        // smile + rosy cheeks on the neck-face
        const m = onRing(v, 3.2, 0);
        const mx = cx + m.x * 0.9;
        const my = 26 + lift;
        if (v.c > 0.5) {
          stamp(l, mx, my, 3, 1, (i) => (i === 1 ? tone(SKIN, 0.0) : null));
          l.set(Math.round(mx - 1.5), my - 1, tone(SKIN, 0.05));
          l.set(Math.round(mx + 0.5), my - 1, tone(SKIN, 0.05));
          stamp(l, mx - 2.5, my - 1, 1, 1, '#e0a08a');
          stamp(l, mx + 2.5, my - 1, 1, 1, '#e0a08a');
        } else {
          stamp(l, mx + 0.5, my, 2, 1, tone(SKIN, 0.05));
          stamp(l, mx - 1.5, my - 1, 1, 1, '#e0a08a');
        }
      }
    };
  const drawBody = () =>
    sp.layer((l) => {
      drawFoot(l);
      drawNeck(l);
    });

  // ---- eye stalks with goggled eyeballs
  const lean = f === 1 ? -0.8 : f === 3 ? 0.8 : 0;
  const stalks = [-1, 1].map((side) => {
    const base = P(v, side * 1.5, 3.8);
    const tip = P(v, side * 2.6, 4.6 + lean);
    return { side, bx: CX + base.x, tx: CX + tip.x, d: tip.d };
  });
  stalks.sort((a, c) => a.d - c.d);
  const drawStalk = (st: (typeof stalks)[number]) => {
    sp.layer((l) => {
      for (let y = 17 + lift; y <= nTop + 1; y++) {
        const t = (y - 17 - lift) / (nTop + 1 - 17 - lift);
        l.set(Math.round(st.tx + (st.bx - st.tx) * t - 0.5), y, tone(SKIN, 0.55));
      }
    });
    sp.layer((l) => {
      const ex = st.tx;
      const ey = 15 + lift;
      stamp(l, ex, ey, 3, 3, (i, j) => ((i === 0 || i === 2) && (j === 0 || j === 2) ? null : face ? '#f6f0e4' : tone(SKIN, 0.6)), false);
      l.set(Math.round(ex - 1.5) + 1, ey - 1, '#f6f0e4');
      if (!face) {
        l.set(Math.round(ex - 1.5) + 1, ey - 1, tone(SKIN, 0.7));
        return;
      }
      // pupil looks the way it faces
      const px = Math.round(ex - 0.5 + v.s * 0.9);
      l.set(px, ey + 1, EYE);
      l.set(px, ey, EYE);
    }, { color: BRASS });
  };

  // ---- wrench in front
  const wr = P(v, 0, 6.6);
  const drawWrench = () =>
    sp.layer((l) => {
      const x = Math.round(CX + wr.x - 0.5);
      const y = 27 + lift;
      l.set(x - 1, y, STEEL.l1);
      l.set(x + 1, y, STEEL.b);
      l.set(x - 1, y + 1, STEEL.b);
      l.set(x, y + 1, STEEL.b);
      l.set(x + 1, y + 1, STEEL.d1);
      for (let j = 2; j <= 4; j++) l.set(x, y + j, tone(STEEL, 0.6 - j * 0.1));
      // little paws
      l.set(x - 1, y + 3, tone(SKIN, 0.75));
      l.set(x + 1, y + 3, tone(SKIN, 0.5));
    }, { darken: 0.6 });

  const shellBehind = shC.d < 0.5;
  if (!shellBehind) {
    for (const st of stalks) drawStalk(st);
    drawBody();
    drawShell();
  } else {
    drawShell();
    drawBody();
    for (const st of stalks) drawStalk(st);
  }
  if (wr.d > -1) drawWrench();
  return sp.done(Math.max(6, Math.min(10, footHw + 0.5)), CX + footC.x * 0.6);
}

const art: CharacterArt = { id: 'snail', draw };
export default art;
