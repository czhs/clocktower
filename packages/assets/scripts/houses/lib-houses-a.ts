// Shared painters for houses-a (house-0 … house-4): cones, round stone towers, pointed (gothic)
// doors and windows, and the small props that give each house its personality. Same conventions as
// ../buildings.ts: moonlight from the upper left, hue-shifted ramps, 1 px dark outline at the end.
import { BEAM, BRASS, CLAY, cutDoor, doorAssembly, DSTONE, GLASS, IRON, LEAF, paintDoorway, type BuildingSprite, type DoorOut, type DoorSpec, type Tf } from '../buildings.js';
import { bayer, type Color, dpick, hash, Img, mix, vnoise } from '../lib/img.js';

export type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------------------
// Palettes (6-7 step ramps, dark -> light)

export const PURPLE_SLATE = ['#140d20', '#1f152d', '#2b1e3d', '#3a2850', '#4b3464', '#5f437a', '#775892'];
export const RUBBLE = ['#1d1a20', '#29252b', '#363137', '#454045', '#565055', '#6a6366', '#807878'];
export const WARM_RUBBLE = ['#1f1a1c', '#2d2626', '#3c3330', '#4d423c', '#5f5249', '#736457', '#887766'];
export const ASHLAR = ['#2e2b33', '#433f48', '#5a5560', '#726c77', '#8b8590', '#a49ea6', '#bcb6ba'];
export const WITCH_ROOF = ['#0c1614', '#13211e', '#1b2e29', '#253c34', '#314b40', '#405c4c', '#526e58'];
export const RED_TILE = ['#240e10', '#371616', '#4e1f1b', '#672b22', '#80392b', '#9a4b36', '#b25f44'];
export const DARK_SLATE = ['#0f0e18', '#171624', '#201f31', '#2b2a40', '#373750', '#454662', '#565876'];
export const TURF = ['#101a10', '#172614', '#21341a', '#2d4420', '#3c5626', '#4e6a2e', '#647e38'];
export const LOGS = ['#22150d', '#341f12', '#4a2d19', '#613c22', '#7a4e2e', '#94643c'];
export const OCHRE_STONE = ['#2e2420', '#45372e', '#5e4c3e', '#78624f', '#927a62', '#ab9478'];
export const CREAM = ['#5a5248', '#736a5c', '#8e8470', '#a89c84', '#bfb398', '#d2c7aa'];
export const STRAW = ['#3a2810', '#5a3e16', '#7a5a22', '#9a7630', '#ba9444', '#d4b060'];

/** Clamp a palette lookup with dithering. */
export const dp = (pal: readonly Color[], v: number, x: number, y: number) => dpick(pal, v, x, y);

// ---------------------------------------------------------------------------------------
// Big forms

/**
 * A cone (spire / conical roof) seen in 3/4 from the front: apex at (cx, apexY), eave on an ellipse
 * centred (cx, eaveY) with radii R x ry. Shingles follow the cone (rows = slant distance, columns =
 * arc length), fish-scale or straight. `shade` lets the caller add per-pixel tweaks.
 */
export function cone(
  img: Img,
  cx: number,
  apexY: number,
  eaveY: number,
  R: number,
  ry: number,
  pal: readonly Color[],
  opts: { seed?: number; rowH?: number; colW?: number; fish?: boolean; bias?: number } = {},
) {
  const L = eaveY - apexY;
  const rowH = opts.rowH ?? 4;
  const colW = opts.colW ?? 5;
  const seed = opts.seed ?? 7;
  for (let y = Math.floor(apexY); y <= Math.ceil(eaveY + ry); y++)
    for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
      const a = (x + 0.5 - cx) / R;
      const b = y + 0.5 - apexY;
      if (b <= 0) continue;
      let s = b / L;
      let sn = 0;
      let cs = 1;
      for (let k = 0; k < 8; k++) {
        sn = Math.max(-1, Math.min(1, a / Math.max(1e-6, s)));
        cs = Math.sqrt(1 - sn * sn);
        s = b / (L + ry * cs);
      }
      if (s > 1 || Math.abs(a) > s * 1.0001 + 0.02) continue;
      if (s < 0.02 && Math.abs(x + 0.5 - cx) > 0.6) continue;
      const th = Math.asin(sn);
      const sl = s * L; // slant (px)
      const row = Math.floor(sl / rowH);
      const fv = sl / rowH - row;
      const u = th * s * R * 1.15 + (row % 2) * colW * 0.5 + hash(row, 0, seed) * colW;
      const fu = u / colW - Math.floor(u / colW);
      const col = Math.floor(u / colW);
      const lx = Math.floor(fu * colW);
      const ly = Math.floor(fv * rowH);
      let v = 0.66 - sn * 0.42 + cs * 0.06 - s * 0.12 + (opts.bias ?? 0);
      v += (hash(col, row, seed) - 0.5) * 0.14;
      if (opts.fish !== false) {
        if (ly === rowH - 1 && (lx === 0 || lx === colW - 1)) v -= 0.36;
        else if (ly === rowH - 1) v -= 0.12;
        else if (lx === 0 && ly >= 1) v -= 0.12;
        if (ly === 0 && lx > 0 && lx < colW - 1) v += 0.1;
      } else {
        if (ly === rowH - 1) v -= 0.3;
        else if (lx === 0) v -= 0.18;
      }
      img.set(x, y, dp(pal, v + (bayer(x, y) - 0.5) * 0.04, x, y));
    }
}

/**
 * Round stone tower body: cylinder of radius r centred on cx, from `top` (rim, at the sides) to
 * `bottom` (front base); stone courses bulge downward with the curvature (`arc` px).
 */
export function cylinder(img: Img, cx: number, r: number, top: number, bottom: number, pal: readonly Color[], mortar: Color, opts: { seed?: number; rh?: number; bw?: number; arc?: number } = {}) {
  const rh = opts.rh ?? 5;
  const bw = opts.bw ?? 8;
  const arc = opts.arc ?? 3;
  const seed = opts.seed ?? 3;
  for (let x = Math.floor(cx - r); x < Math.ceil(cx + r); x++) {
    const nx = (x + 0.5 - cx) / r;
    if (Math.abs(nx) >= 1) continue;
    const c = Math.sqrt(1 - nx * nx);
    for (let y = top; y <= bottom; y++) {
      const yy = y - top - arc * c;
      if (yy < 0 || yy > bottom - top - arc) continue;
      const row = Math.floor(yy / rh);
      const ly = Math.floor(yy) - row * rh;
      const u = Math.asin(nx) * r + (row % 2) * bw * 0.5 + hash(row, 2, seed) * 3;
      const q = u / bw;
      const blk = Math.floor(q);
      const fx = (q - blk) * bw;
      const step = 1 / Math.max(0.25, c);
      if (ly === rh - 1 || fx < Math.min(step, bw * 0.45)) {
        img.set(x, y, mix(mortar, pal[0]!, nx < 0 ? 0.3 : 0));
        continue;
      }
      let v = 0.56 - nx * 0.36 - Math.max(0, nx - 0.45) * 0.5 + (hash(blk, row, seed) - 0.5) * 0.3;
      if (ly === 0) v += 0.16;
      if (fx < step + 1) v += 0.1;
      if (ly === rh - 2) v -= 0.1;
      v += (hash(x, y, seed + 1) - 0.5) * 0.12;
      img.set(x, y, dp(pal, v, x, y));
    }
  }
}

// ---------------------------------------------------------------------------------------
// Door, stoop, finishing

/** A pale stoop under the door (cottageFront's), spanning door width + margins. */
export function stoop(img: Img, dx0: number, dw: number, doorBottom: number, pal: readonly Color[] = DSTONE, extra = 3) {
  for (let j = 0; j < 3; j++)
    for (let i = -extra - (j > 0 ? 1 : 0); i < dw + extra + (j > 0 ? 1 : 0); i++) {
      const x = dx0 + i;
      const y = doorBottom + 1 + j;
      img.set(x, y, j === 0 ? dp(pal, 0.85 + (hash(x, y, 4) - 0.5) * 0.15, x, y) : dp(pal, j === 1 ? 0.45 : 0.25, x, y));
    }
}

/** Standard front door centred at cx with its last leaf row at doorBottom (+ the stoop). */
export function frontDoor(img: Img, cx: number, doorBottom: number, spec: DoorSpec, opts: { jamb?: number; stoop?: boolean } = {}): { d: DoorOut; x0: number; top: number; T: Tf } {
  const x0 = cx - Math.floor(spec.w / 2);
  const top = doorBottom - (spec.h - 1);
  const T: Tf = (i, j) => [x0 + i, top + j];
  const d = doorAssembly(img, T, spec, opts.jamb ?? 2, spec.seed);
  if (opts.stoop !== false) stoop(img, x0, spec.w, doorBottom);
  return { d, x0, top, T };
}

/**
 * Gothic door: pointed (two-centred) arch leaf of w x h, studded oak planks with long iron
 * straps, pale voussoirs. Returns a DoorOut compatible with cutDoor().
 */
export function pointedDoor(img: Img, x0: number, top: number, w: number, h: number, paint: Color, hinge: 'left' | 'right', seed: number, surround: readonly Color[] = DSTONE): DoorOut {
  const archH = Math.round(w * 0.75);
  const inLeaf = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    if (j >= archH) return true;
    // two circles of radius w centred on the opposite springing points
    const yy = archH - (j + 0.5);
    const xl = i + 0.5;
    const xr = w - (i + 0.5);
    return Math.hypot(w - xl, yy) <= w * 0.98 && Math.hypot(w - xr, yy) <= w * 0.98;
  };
  // pale stone surround + voussoirs
  for (let j = -3; j < h; j++)
    for (let i = -3; i < w + 3; i++) {
      if (inLeaf(i, j)) continue;
      let near = false;
      for (let dj = -3; dj <= 3 && !near; dj++) for (let di = -2; di <= 2; di++) if (inLeaf(i + di, j + dj)) near = true;
      if (!near) continue;
      const left = i < w / 2;
      let v = 0.66 + (left ? 0.12 : -0.14) + (hash(i, j, seed) - 0.5) * 0.14;
      if (j < archH && (Math.round(Math.atan2(archH - j, i + 0.5 - w / 2) * 3) % 2 === 0)) v -= 0.12;
      if (j >= archH && (j + 40) % 5 === 4 && (i < 0 || i >= w)) v -= 0.3;
      if (!left && inLeaf(i - 1, j)) v -= 0.25;
      img.set(x0 + i, top + j, dp(surround, v, x0 + i, top + j));
    }
  // leaf: oak planks
  const base = mix(paint, '#fff1cc', 0.08);
  const pal = [mix(base, '#0b0714', 0.62), mix(base, '#160d2a', 0.38), base, mix(base, '#fff1cc', 0.2), mix(base, '#fff6e0', 0.36)];
  const mask = new Uint8Array(img.w * img.h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inLeaf(i, j)) continue;
      const lu = i % 3;
      let v = 0.5 + (lu === 0 ? 0.14 : 0) + (hash(Math.floor(i / 3), 3, seed) - 0.5) * 0.16 - j / (h * 6);
      if (lu === 2) v = 0.14;
      if (i === 0) v += 0.1;
      if (i === w - 1) v -= 0.12;
      img.set(x0 + i, top + j, dp(pal, v, x0 + i, top + j));
      mask[(top + j) * img.w + x0 + i] = 1;
    }
  const latchLeft = hinge === 'right';
  for (const y of [archH + 1, h - 5]) {
    const len = Math.ceil(w * 0.8);
    for (let k = 0; k < len; k++) {
      const i = latchLeft ? w - 1 - k : k;
      if (inLeaf(i, y)) img.set(x0 + i, top + y, k % 3 === 2 ? IRON[3]! : IRON[1]!);
    }
  }
  // iron ring pull
  const kx = x0 + (latchLeft ? 2 : w - 3);
  const ky = top + Math.round(h * 0.55);
  img.set(kx, ky, IRON[3]!);
  img.set(kx - 1, ky + 1, IRON[2]!);
  img.set(kx + 1, ky + 1, IRON[2]!);
  img.set(kx, ky + 2, BRASS[3]!);
  // recess shadow at the top of the leaf
  for (let i = 0; i < w; i++) {
    let j = 0;
    while (j < h && !inLeaf(i, j)) j++;
    if (j < h) img.tint(x0 + i, top + j, '#05030a', 0.45);
  }
  // doorway: the standard room view, clipped to the pointed leaf; its head in shadow
  const spec: DoorSpec = { w, h, arched: false, kind: 'planks', hinge, paint: toHexStr(paint), wreath: false, seed };
  const dw = paintDoorway(spec);
  const hole = new Img(img.w, img.h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inLeaf(i, j)) continue;
      let c = dw.get(i, j);
      if (j < archH) c = mix(c, '#05030a', 0.5 * (1 - j / archH));
      hole.set(x0 + i, top + j, c);
    }
  return { mask, hole, spec };
}

function toHexStr(c: Color): string {
  if (typeof c === 'string') return c;
  return '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Outline the finished sprite and cut the door leaf / doorway frames. */
export function finish(img: Img, d: DoorOut, windows: Pt[], chimney: Pt | null): BuildingSprite {
  img.outline({ darken: 0.72 });
  const cut = cutDoor(img, d, d.spec.hinge);
  return { img, windows, chimney, ...cut };
}

// ---------------------------------------------------------------------------------------
// Windows

/** Warm glass fill for an arbitrary mask (brighter at the bottom centre like a lit room). */
export function glass(img: Img, x: number, y: number, w: number, h: number, inside: (i: number, j: number) => boolean, seed = 1) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      const v = 0.9 - j / (h * 1.8) - Math.abs(i + 0.5 - w / 2) / (w * 2.2) + (hash(i, j, seed) < 0.05 ? 0.15 : 0) - (j < 2 ? 0.12 : 0);
      img.set(x + i, y + j, dp(GLASS, v, x + i, y + j));
    }
}

/** Tall pointed lancet window (glass w x h) with a stone frame, a mullion and a little sill. */
export function lancet(img: Img, x: number, y: number, w: number, h: number, frame: readonly Color[], seed = 1, mullion = true): Pt {
  const ah = Math.ceil(w * 0.9);
  const inside = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    if (j >= ah) return true;
    const yy = ah - (j + 0.5);
    return Math.hypot(w - (i + 0.5), yy) <= w * 0.98 && Math.hypot(i + 0.5, yy) <= w * 0.98;
  };
  for (let j = -2; j < h + 2; j++)
    for (let i = -2; i < w + 2; i++) {
      if (inside(i, j)) continue;
      let near = false;
      for (let dj = -2; dj <= 2 && !near; dj++) for (let di = -1; di <= 1; di++) if (inside(i + di, j + dj)) near = true;
      if (!near) continue;
      img.set(x + i, y + j, dp(frame, (i < w / 2 ? 0.75 : 0.45) + (j >= h ? -0.1 : 0) + (hash(i, j, seed) - 0.5) * 0.1, x + i, y + j));
    }
  glass(img, x, y, w, h, inside, seed);
  if (mullion && w >= 5) img.vline(x + Math.floor(w / 2), y + 2, y + h - 1, frame[1]!);
  img.hline(x, x + w - 1, y + Math.round(h * 0.6), mix(frame[1]!, GLASS[1]!, 0.3));
  img.hline(x - 2, x + w + 1, y + h + 1, frame[frame.length - 2]!);
  return { x: x + Math.floor(w / 2), y: y + Math.round(h * 0.6) };
}

/** Rose window: stone ring, glowing glass with 8 thin tracery spokes, a hub and little ruby foils. */
export function roseWindow(img: Img, cx: number, cy: number, r: number, frame: readonly Color[]) {
  img.ellipse(cx, cy, r + 2, r + 2, (x, y, nx, ny) => dp(frame, 0.72 - nx * 0.3 - ny * 0.25 + (hash(x, y, 5) - 0.5) * 0.1, x, y));
  img.ellipse(cx, cy, r, r, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    const a = Math.atan2(ny, nx);
    const k = Math.round(a / (Math.PI / 4));
    const off = Math.abs(a - k * (Math.PI / 4)) * d * r; // px distance from the nearest spoke
    if (d < 0.22) return GLASS[4]!;
    if (d < 0.36) return frame[1]!;
    if (off < 0.5 && d < 0.92) return mix(frame[1]!, GLASS[1]!, 0.25);
    if (d > 0.88) return frame[2]!;
    const mid = Math.abs(d - 0.62) < 0.13 && off > 1.1;
    if (mid) return (k + 8) % 2 === 0 ? dp(['#5a1020', '#8a1e30', '#b83a40'], 0.8 - ny * 0.4, x, y) : dp(['#1a2a5a', '#2a4a8a', '#4a6ab0'], 0.8 - ny * 0.4, x, y);
    return dp(GLASS, 0.98 - d * 0.4 - ny * 0.12, x, y);
  });
}

/** Round (porthole) window with a 4-pane cross. */
export function roundWindow(img: Img, cx: number, cy: number, r: number, frame: Color = BEAM[0]!) {
  img.ellipse(cx, cy, r + 1, r + 1, frame);
  img.ellipse(cx, cy, r, r, (x, y, nx, ny) => dp(GLASS, 0.9 - ny * 0.3 - Math.abs(nx) * 0.15, x, y));
  img.vline(Math.floor(cx), Math.round(cy - r), Math.round(cy + r - 1), BEAM[1]!);
  img.hline(Math.round(cx - r), Math.round(cx + r - 1), Math.floor(cy), BEAM[1]!);
}

/** Flower box under a window. */
export function flowerBox(img: Img, x: number, y: number, w: number, seed: number, colors = ['#c0304a', '#e8e0d0', '#a040a0', '#e8a030']) {
  img.rect(x, y, w, 3, '#4a2e1e');
  img.hline(x, x + w - 1, y, '#6a4430');
  img.hline(x, x + w - 1, y + 2, '#2e1a10');
  for (let i = 0; i < w; i++) {
    img.set(x + i, y - 1, i % 2 ? LEAF[3]! : LEAF[2]!);
    if (hash(i, x, seed) < 0.6) img.set(x + i, y - 1 - (i % 2), colors[(i + x) % colors.length]!);
  }
}

// ---------------------------------------------------------------------------------------
// Props (all purely decorative)

/** Iron cauldron on three legs over a small fire, bubbling green brew. ~13x11, bottom at y. */
export function cauldron(img: Img, cx: number, y: number) {
  // fire + logs
  img.hline(cx - 4, cx + 3, y, '#3a2416');
  img.hline(cx - 3, cx + 2, y - 1, '#5a3a22');
  for (let i = -3; i <= 2; i++) img.set(cx + i, y - 2, i % 2 ? '#e8862e' : '#ffcf5a');
  img.set(cx - 1, y - 3, '#ffe9a0');
  img.set(cx + 1, y - 3, '#ffb43a');
  // legs
  img.vline(cx - 5, y - 4, y, IRON[1]!);
  img.vline(cx + 4, y - 4, y, IRON[1]!);
  // pot body
  img.ellipse(cx - 0.5, y - 7, 6.5, 4.5, (x, yy, nx, ny) => dp(IRON, 0.62 - nx * 0.45 - ny * 0.25, x, yy));
  // rim + brew
  img.hline(cx - 6, cx + 5, y - 11, IRON[3]!);
  img.hline(cx - 5, cx + 4, y - 10, '#3e8a3a');
  img.hline(cx - 4, cx + 3, y - 11, '#6ac050');
  img.set(cx - 2, y - 12, '#9ae070');
  img.set(cx + 1, y - 13, '#7ad060');
  img.set(cx + 2, y - 12, '#b8f090');
  img.set(cx - 3, y - 14, '#6ab050');
  img.set(cx - 7, y - 10, IRON[2]!);
  img.set(cx + 6, y - 10, IRON[2]!);
}

/** A pumpkin (rx x ry), optionally carved and glowing. */
export function pumpkin(img: Img, cx: number, bottom: number, rx: number, ry: number, carved = false) {
  const P = ['#3a1a08', '#6a2e0c', '#9a4a14', '#c8681e', '#e8903a'];
  img.ellipse(cx, bottom - ry, rx, ry, (x, y, nx, ny) => {
    const rib = Math.abs(Math.sin((nx + 1) * Math.PI * 1.5)) < 0.25;
    return dp(P, 0.62 - nx * 0.35 - ny * 0.3 - (rib ? 0.22 : 0), x, y);
  });
  img.set(Math.round(cx), Math.round(bottom - 2 * ry), '#3a5a20');
  img.set(Math.round(cx) + 1, Math.round(bottom - 2 * ry) - 1, '#2a4418');
  if (carved) {
    const cy = Math.round(bottom - ry);
    const x = Math.round(cx);
    img.set(x - 2, cy - 1, '#ffd27a');
    img.set(x + 1, cy - 1, '#ffd27a');
    img.hline(x - 2, x + 1, cy + 1, '#ffb43a');
    img.set(x - 1, cy + 2, '#ffd27a');
    img.set(x + 1, cy + 2, '#e8862e');
  }
}

/** A besom broom leaning against a wall (handle from (x, y) up-right). */
export function broom(img: Img, x: number, y: number, len: number) {
  for (let k = 0; k < len; k++) img.set(x + Math.floor(k / 5), y - 6 - k, k % 7 === 0 ? LOGS[4]! : LOGS[3]!);
  for (let j = 0; j < 7; j++)
    for (let i = -2 - Math.floor(j / 3); i <= 1 + Math.floor(j / 3); i++) img.set(x + i, y - 6 + j, dp(STRAW, 0.65 - j * 0.05 + (i % 2 ? -0.2 : 0), x + i, y - 6 + j));
  img.hline(x - 2, x + 1, y - 5, '#5a2a1a');
}

/** Crow perched (≈7x6), feet at (x, y). */
export function crow(img: Img, x: number, y: number, faceLeft: boolean) {
  const s = faceLeft ? -1 : 1;
  const K = '#0e0b14';
  const K2 = '#262038';
  img.rect(x - 2, y - 4, 5, 3, K); // body
  img.set(x - 3 * s, y - 2, K); // tail
  img.set(x - 3 * s, y - 1, K);
  img.set(x - 4 * s, y - 1, K);
  img.rect(x + (s > 0 ? 1 : -2), y - 6, 2, 2, K); // head
  img.set(x + 3 * s, y - 5, '#8a7a5a'); // beak
  if (s < 0) img.set(x - 4, y - 5, '#8a7a5a');
  img.set(x + (s > 0 ? 2 : -2), y - 6, '#c8b060'); // eye glint
  img.set(x - 1, y - 4, K2); // wing sheen
  img.set(x, y - 3, K2);
  img.set(x, y, '#3a3040');
  img.set(x + 1, y, '#3a3040');
}

/** Straw beehive skep (dome of coils) on its bottom row y. */
export function skep(img: Img, cx: number, y: number, r: number) {
  img.ellipse(cx, y - r * 0.15, r, r * 1.15, (px, py, nx, ny) => {
    if (py > y) return null;
    const coil = Math.floor(py) % 2 === 0;
    return dp(STRAW, 0.68 - nx * 0.38 - ny * 0.2 - (coil ? 0.16 : 0), px, py);
  });
  img.rect(Math.round(cx) - 1, y - 1, 2, 2, '#1a1008'); // entrance
  img.set(Math.round(cx) + 2, y - Math.round(r * 1.5), '#e8c030'); // a bee
  img.set(Math.round(cx) + 3, y - Math.round(r * 1.5) - 1, '#e8c030');
}

/** A sunflower: stalk from (x, y) up `h`, head facing the viewer. */
export function sunflower(img: Img, x: number, y: number, h: number, lean = 0) {
  for (let k = 0; k < h; k++) {
    const xx = x + Math.round((lean * k) / h);
    img.set(xx, y - k, k % 4 === 0 ? LEAF[3]! : LEAF[2]!);
    if (k % 6 === 3) {
      img.set(xx - 1, y - k, LEAF[3]!);
      img.set(xx - 2, y - k + 1, LEAF[4]!);
    }
    if (k % 6 === 0 && k > 0) {
      img.set(xx + 1, y - k, LEAF[3]!);
      img.set(xx + 2, y - k + 1, LEAF[2]!);
    }
  }
  const hx = x + lean;
  const hy = y - h - 2;
  img.ellipse(hx + 0.5, hy + 0.5, 3.4, 3.4, (px, py, nx, ny) => (nx * nx + ny * ny < 0.35 ? dp(['#2a1608', '#4a2a10', '#6a4018'], 0.6 - nx * 0.3 - ny * 0.3, px, py) : dp(['#a06a10', '#d09a20', '#f0c030', '#ffe070'], 0.7 - nx * 0.3 - ny * 0.3, px, py)));
}

/** A cabbage / round leafy vegetable. */
export function cabbage(img: Img, cx: number, bottom: number, r: number, seed: number) {
  img.ellipse(cx, bottom - r * 0.8, r, r * 0.8, (px, py, nx, ny) => dp(['#1c3220', '#2a4a2a', '#3e6a36', '#5a8a44', '#7aa858'], 0.6 - nx * 0.35 - ny * 0.35 + (hash(px, py, seed) - 0.5) * 0.25, px, py));
}

/** Hanging yarn skein (≈3x6) at (x, y) hanging from a rod. */
export function skein(img: Img, x: number, y: number, c: Color, len = 6) {
  const pal: Color[] = [mix(c, '#0b0714', 0.5), mix(c, '#160d2a', 0.25), c, mix(c, '#fff1cc', 0.3)];
  img.set(x + 1, y, pal[0]!);
  for (let j = 1; j < len; j++)
    for (let i = 0; i < 3; i++) img.set(x + i, y + j, dp(pal, 0.6 - (i - 1) * 0.3 + ((i + j) % 2 ? 0.12 : -0.08) - (j === len - 1 ? 0.2 : 0), x + i, y + j));
}

/** Bargeboard / roof edge line drawn between two points (thickness k, lit along the top). */
export function edgeLine(img: Img, x0: number, y0: number, x1: number, y1: number, pal: readonly Color[], k = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let t = 0; t <= n; t++) {
    const x = x0 + ((x1 - x0) * t) / n;
    const y = y0 + ((y1 - y0) * t) / n;
    for (let q = 0; q < k; q++) img.set(x, y + q, pal[q === 0 ? pal.length - 2 : 1]!);
  }
}

/** Noise helper re-export for house files. */
export const noise = vnoise;
export { BEAM, BRASS, CLAY, DSTONE, GLASS, IRON, LEAF };
