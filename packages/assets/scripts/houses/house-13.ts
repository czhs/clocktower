// house-13 — Riverbend: a fisherman's house roofed with an old upturned boat (east-facing), like
// the boat sheds of Lindisfarne. Black tarred weatherboard walls on a stone footing; the clinker
// hull — rust-red bottom, cream boot-stripe, dark topsides — is the roof, its transom end planked
// up with a porthole and a ship's lantern hanging from the stern post. Nets with cork floats, a
// life ring, oars, a little rowing boat and a lobster pot. Blue door in the side wall.
import type { HouseArt } from './types.js';
import { BRASS, GLASS, IRON, paintWindow, place, STONE } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { type Color, dpick, hash, Img, mix, vnoise } from '../lib/img.js';
import { finish, groundLine, hangLantern, rise, roundWindow, shearPlace, sideDoor, type Pt } from './lib-houses-c.js';

const TAR = ['#0c0a10', '#16141c', '#211e28', '#2e2a36', '#3e3a48', '#524c5c'];
const ANTIFOUL = ['#2a0e0c', '#461612', '#621f18', '#7e2c20', '#9a3e2a', '#b4563a'];
const TOPSIDE = ['#0c1420', '#14202e', '#1c2e40', '#284056', '#36546c'];
const CREAM = '#e0d4b0';
const DRIFT = ['#2a2420', '#3e3630', '#564a40', '#706050', '#8a7a64', '#a49478'];
const NET = '#8a7a5a';

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 16;
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const FW = 40; // front (end) wall width
  const SW = W - FW - 2; // side wall strip
  const wallTop = H - 28;
  const base = groundLine(H, FW);

  // --- walls: black tarred weatherboard on a stone footing
  const weather = (x: number, y: number, side: boolean): Color => {
    const r = (y + 400) % 4;
    let v = 0.5 + (r === 0 ? 0.3 : r === 3 ? -0.3 : 0) + (vnoise(x * 0.3, y, 6, seed) - 0.5) * 0.25;
    if (!side && x < 4) v += 0.1;
    if (side) v -= 0.15;
    return dpick(TAR, v, x, y);
  };
  for (let y = wallTop; y < H; y++) for (let x = 0; x < FW; x++) img.set(x, y, weather(x, y, false));
  stonework(img, 0, H - 4, FW, 4, STONE, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  {
    const tex = new Img(SW, H - wallTop);
    for (let j = 0; j < tex.h; j++) for (let i = 0; i < SW; i++) tex.set(i, j, weather(i + 60, j + wallTop - rise(i), true));
    stonework(tex, 0, tex.h - 4, SW, 4, STONE.map((c) => toHexMix(c, 0.2)), '#100e14', { rh: 4, sw: 7, seed: seed + 3 });
    shearPlace(img, tex, FW, base, 0);
    for (let y = wallTop; y < H; y++) img.set(FW - 1, y, mix(img.get(FW - 1, y), '#000000', 0.35));
  }

  // --- the upturned hull. Profile (end-on): gunwale at y = wallTop+2, keel at the top; a
  // V-ish hull with full shoulders, so the end reads as a boat's section, not a barrel vault.
  const keelY = wallTop - 38;
  const cx = FW / 2;
  const HW = FW / 2 + 3; // overhangs the walls
  const G = wallTop + 2;
  const tOf = (y: number) => (G - y) / (G - keelY);
  const hwAt = (y: number) => {
    const t = tOf(y);
    return t <= 0 ? HW : t >= 1 ? 0.5 : HW * Math.pow(1 - t, 0.58) * (1 + 0.08 * Math.sin(t * Math.PI));
  };
  const STRAKES = 7;
  const band = (t: number): readonly Color[] => (t < 0.3 ? TOPSIDE : t < 0.36 ? [CREAM, CREAM, CREAM] : ANTIFOUL);
  /** Value for a clinker strake: each plank's lower edge is a dark lap line, its upper edge catches light. */
  const strakeV = (t: number) => {
    const f = (t * STRAKES) % 1;
    return f < 0.12 ? -0.38 : f > 0.8 ? 0.14 : 0;
  };
  const R: [number, number] = [SW + 1, -rise(SW)];
  // near side of the hull, receding along the length (drawn first: the end covers its front edge)
  for (let y = keelY; y <= G; y++) {
    const hw = hwAt(y);
    const t = tOf(y);
    const x0 = cx + hw;
    for (let k = 0; k <= R[0] * 2; k++) {
      const kk = k / 2;
      const x = Math.round(x0 + kk);
      const yy = Math.round(y - kk / 2);
      if (x > W - 2) continue;
      // near the keel the hull faces the sky (lit), near the gunwale it faces east (dark)
      let v = 0.3 + t * 0.5 + strakeV(t);
      if (band(t) === ANTIFOUL && hash(Math.floor(kk / 6), Math.floor(t * STRAKES), seed) < 0.2) v += 0.07; // patched planks
      img.set(x, yy, dpick(band(t), v, x, yy));
    }
  }
  // the hull's cut end: a thick rim of planking (showing the paint bands) round tarred end boards
  for (let y = keelY; y <= G; y++) {
    const hw = hwAt(y);
    const t = tOf(y);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (x < 0) continue;
      const dx = Math.abs(x + 0.5 - cx);
      const rim = dx > hw - 4 || y > G - 3;
      if (rim) {
        const left = x < cx;
        let v = (left ? 0.78 : 0.42) + strakeV(t) * 0.6;
        if (dx > hw - 1.2) v -= 0.3; // outer skin edge
        if (dx < hw - 3 && y <= G - 3) v -= 0.2; // inner edge in shadow
        img.set(x, y, dpick(band(t), v, x, y));
      } else {
        const bd = Math.floor((x + 1) / 4);
        let v = 0.5 + (hash(bd, 3, seed) - 0.5) * 0.3 + (vnoise(x, y * 0.3, 5, seed + 6) - 0.5) * 0.2;
        if ((x + 1) % 4 === 0) v -= 0.35;
        if (y < keelY + 8) v -= 0.12;
        img.set(x, y, dpick(DRIFT, v, x, y));
      }
    }
  }
  // the keel / stern post standing proud at the top, running back along the ridge
  for (let k = 0; k <= R[0]; k++) {
    const x = Math.round(cx + k);
    const y = keelY - 1 - rise(k);
    img.set(x, y, ANTIFOUL[5]!);
    img.set(x, y - 1, ANTIFOUL[3]!);
  }
  for (let y = keelY - 5; y <= keelY + 1; y++) {
    img.set(Math.round(cx) - 1, y, DRIFT[4]!);
    img.set(Math.round(cx), y, DRIFT[2]!);
  }
  // shadow under the gunwale
  for (let x = 0; x < FW; x++) img.blend(x, G + 1, '#05030a', 0.5);
  for (let k = 0; k < SW; k++) img.blend(FW + k, base(FW + k) - (H - wallTop) + 4, '#05030a', 0.45);
  // porthole in the transom, ship's lantern hanging from the stern post
  windows.push(roundWindow(img, cx + 0.5, keelY + 24, 4, BRASS, GLASS));
  const sternLamp = hangLantern(img, Math.round(cx) - 7, keelY + 14, 3, IRON, GLASS);
  img.hline(Math.round(cx) - 7, Math.round(cx) - 1, keelY + 3, IRON[2]!);
  windows.push(sternLamp);

  // --- front wall: window with blue shutters, a life ring
  {
    const win = paintWindow({ ...style, shutters: '#3a6a9a' }, 8, 9, true, seed);
    place(img, win, (i, j) => [5 + i, wallTop + 8 + j]);
    windows.push({ x: 12, y: wallTop + 13 });
    img.rect(5, wallTop + 19, win.w, 2, DRIFT[4]!);
  }
  {
    // life ring: red and white quarters
    const rx = 30;
    const ry = wallTop + 12;
    img.ellipse(rx, ry, 5, 5, (x, y, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d < 0.3) return null;
      const a = Math.atan2(ny, nx);
      const q = Math.floor(((a + Math.PI) / (Math.PI / 2)) + 0.5) % 2;
      const c = q ? '#c8302a' : '#ece4d0';
      return mix(c, d > 0.8 || ny > 0.3 ? '#0b0714' : '#fff6e0', d > 0.8 ? 0.3 : ny < -0.3 ? 0.15 : 0.1);
    });
    img.set(rx, ry - 6, IRON[3]!);
  }
  // oars leaning on the wall
  for (const [x0, len] of [
    [22, 30],
    [25, 27],
  ] as const) {
    for (let k = 0; k < len; k++) {
      const x = x0 + Math.round(k * 0.12);
      const y = H - 2 - k;
      img.set(x, y, k > len - 7 ? '#c8a070' : '#9a7048');
      if (k > len - 7) img.set(x + 1, y, '#9a7048');
    }
  }

  // --- the blue front door in the side wall, a ship's lamp beside it
  const { d } = sideDoor(img, { x0: FW + 4, base, paint: '#2f6aa8', seed, kind: 'planks', arched: false, h: 20 });
  const lk = FW + 15;
  windows.push(hangLantern(img, lk, base(lk) - 14, 1, IRON, GLASS));
  img.hline(lk, lk + 2, base(lk) - 21, IRON[2]!);
  {
    // tiny porthole further along the side
    const win = new Img(5, 5);
    roundWindow(win, 2.5, 2.5, 1.6, BRASS, GLASS, false);
    shearPlace(img, win, FW + 17, base, 12);
  }

  // --- stovepipe through the hull
  let chim: Pt;
  {
    const px = 49;
    const py = keelY + 4 - rise(px - cx) + 2;
    for (let y = py - 9; y <= py; y++) for (let i = 0; i < 3; i++) img.set(px + i, y, ['#6a6474', '#4a4452', '#2a2632'][i]!);
    img.rect(px - 1, py - 10, 5, 1, '#8a8496');
    img.rect(px, py - 11, 3, 1, '#4a4452');
    chim = { x: px + 1, y: py - 11 };
  }

  // --- nets hung from the gunwale with cork floats, a rowing boat, a lobster pot
  {
    const nx0 = 1;
    const nx1 = 13;
    for (let y = wallTop + 3; y < H - 6; y++)
      for (let x = nx0; x <= nx1; x++) {
        const sag = Math.round(Math.sin(((x - nx0) / (nx1 - nx0)) * Math.PI) * 3);
        if (y < wallTop + 3 + sag) continue;
        if ((x + y) % 3 === 0 || (x - y + 300) % 3 === 0) img.blend(x, y, NET, 0.85);
      }
    for (let x = nx0; x <= nx1; x += 3) {
      const sag = Math.round(Math.sin(((x - nx0) / (nx1 - nx0)) * Math.PI) * 3);
      img.set(x, wallTop + 3 + sag, '#e8862e');
      img.set(x + 1, wallTop + 3 + sag, '#c0602a');
    }
  }
  {
    // little rowing boat lying in front, bow to the left: white sides with a teal sheer stripe,
    // and (seen from above) its wooden inside with two thwarts
    const bx = 2;
    const by = H - 1;
    const L = 21;
    for (let i = 0; i < L; i++) {
      const tl = Math.max(0, 6 - i); // the bow narrows and rises
      const tr = Math.max(0, i - (L - 2));
      const yTop = by - 9 + Math.round(tl * 0.7) + tr;
      const ySide = by - 5 + Math.round(tl * 0.35);
      const yBot = by - Math.round(tl * 0.5);
      const x = bx + i;
      for (let y = yTop; y <= yBot; y++) {
        let c: Color;
        if (y === yTop) c = '#c8a070';
        else if (y < ySide - 1) c = i === 8 || i === 14 ? '#9a7048' : dpick(['#2a1a10', '#40281a', '#5a3a24'], 0.3 + (y - yTop) * 0.12, x, y);
        else if (y === ySide - 1) c = '#d8b880';
        else if (y === ySide) c = '#2f8a8a';
        else c = dpick(['#8a8478', '#b0a898', '#d4ccb8', '#ece4d0'], 0.85 - (y - ySide) * 0.15 - (i > L - 4 ? 0.2 : 0), x, y);
        img.set(x, y, c);
      }
    }
    img.set(bx + 1, by - 6, '#c8a070');
  }
  {
    // lobster pot: a domed cage of withies
    const lx = 31;
    const ly = H - 2;
    img.ellipse(lx, ly - 3, 5, 4, (x, y, nx, ny) => (ny > 0.6 ? '#4a3a24' : (x + 1) % 2 === 0 || y === ly - 3 ? (ny < -0.2 ? '#b09060' : '#8a7048') : null));
    img.hline(lx - 5, lx + 4, ly, '#4a3a24');
  }
  return finish(img, d, windows, chim);
};

function toHexMix(c: string, t: number): string {
  const m = mix(c, '#0b0714', t);
  return '#' + [m[0], m[1], m[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export default art;
