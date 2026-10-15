// Runtime-generated FX textures (canvas). Smooth ones (glows, haze, shadows, embers) use LINEAR
// filtering so they read as light rather than pixels; flame frames stay NEAREST pixel art.
import * as Phaser from 'phaser';

export const TX = {
  glow: 'fx-glow',
  disc: 'fx-disc',
  shadow: 'fx-shadow',
  ember: 'fx-ember',
  fogA: 'fx-fog-a',
  fogB: 'fx-fog-b',
  hearth: 'fx-flame-hearth',
  candle: 'fx-flame-candle',
  brazier: 'fx-flame-brazier',
  rain: 'fx-rain',
} as const;

export const HEARTH = { w: 12, h: 10, frames: 6 };
export const CANDLE = { w: 3, h: 5, frames: 4 };
export const BRAZIER = { w: 8, h: 9, frames: 6 };

// Light palette (docs/art-direction.md): Ember, Lamplight, Flame core + a darker tip.
const FLAME_CORE = '#ffe2a0';
const FLAME_MID = '#f0b85f';
const FLAME_EDGE = '#d98043';
const FLAME_TIP = '#a8452a';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function radial(size: number, alpha: (d: number) => number, rgb = [255, 255, 255], sy = 1) {
  const { c, ctx } = canvas(size, Math.round(size * sy));
  const img = ctx.createImageData(c.width, c.height);
  const cx = c.width / 2;
  const cy = c.height / 2;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const d = Math.hypot((x + 0.5 - cx) / cx, (y + 0.5 - cy) / cy);
      const a = Math.max(0, Math.min(1, alpha(d)));
      const i = (y * c.width + x) * 4;
      img.data[i] = rgb[0]!;
      img.data[i + 1] = rgb[1]!;
      img.data[i + 2] = rgb[2]!;
      img.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Tileable fractal value noise (wraps at `size`), shaped into wispy patches. */
function fogCanvas(size: number, seed: number, cells: number[], shape: (n: number) => number) {
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const rnd = (i: number, j: number, o: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed + o, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  const field = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  cells.forEach((n, o) => {
    const step = size / n;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const gy = y / step;
        const i0 = Math.floor(gx);
        const j0 = Math.floor(gy);
        const fx = sm(gx - i0);
        const fy = sm(gy - j0);
        const i1 = (i0 + 1) % n;
        const j1 = (j0 + 1) % n;
        const a = rnd(i0, j0, o);
        const b = rnd(i1, j0, o);
        const cc = rnd(i0, j1, o);
        const d = rnd(i1, j1, o);
        field[y * size + x]! += amp * (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy);
      }
    total += amp;
    amp *= 0.5;
  });
  for (let i = 0; i < size * size; i++) {
    const a = shape(field[i]! / total);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function hash(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hearth fire: wide tongues, flame core low and central. */
function hearthCanvas({ w, h, frames } = HEARTH) {
  const { c, ctx } = canvas(w * frames, h);
  const cx = (w - 1) / 2;
  for (let f = 0; f < frames; f++)
    for (let x = 0; x < w; x++) {
      const e = Math.abs(x - cx) / (w / 2 + 0.5);
      const base = h * (1 - e * e);
      const wob = 0.5 + 0.5 * Math.sin(x * 1.9 + f * (Math.PI / 3) * 2) * Math.cos(x * 0.7 - f * 1.3);
      const hh = Math.max(1, Math.round(base * (0.55 + 0.45 * wob)));
      for (let y = 0; y < hh; y++) {
        const rel = y / hh;
        let col = FLAME_EDGE;
        if (e < 0.55 && rel < 0.5) col = FLAME_CORE;
        else if (rel < 0.72 || (e < 0.4 && rel < 0.85)) col = FLAME_MID;
        else if (rel > 0.9 && hh > 3) col = FLAME_TIP;
        ctx.fillStyle = col;
        ctx.fillRect(f * w + x, h - 1 - y, 1, 1);
      }
      // a detached spark above some tongues
      if (hh > 5 && hash(f, x) > 0.72 && hh + 2 < h) {
        ctx.fillStyle = FLAME_EDGE;
        ctx.fillRect(f * w + x, h - 1 - hh - 1, 1, 1);
      }
    }
  return c;
}

/** Candle flame: a 1 px wick column 3-5 px tall that sways at the tip. */
function candleCanvas() {
  const { w, h, frames } = CANDLE;
  const { c, ctx } = canvas(w * frames, h);
  const tips = [0, 1, 0, -1];
  const tall = [4, 5, 4, 3];
  for (let f = 0; f < frames; f++) {
    const ox = f * w;
    const t = tall[f]!;
    for (let y = 0; y < t; y++) {
      const rel = y / t;
      ctx.fillStyle = rel < 0.4 ? FLAME_CORE : rel < 0.75 ? FLAME_MID : FLAME_EDGE;
      const sway = y === t - 1 ? tips[f]! : 0;
      ctx.fillRect(ox + 1 + sway, h - 1 - y, 1, 1);
    }
    ctx.fillStyle = FLAME_EDGE;
    ctx.fillRect(ox + (f % 2 ? 0 : 2), h - 1, 1, 1);
  }
  return c;
}

function addSheet(tm: Phaser.Textures.TextureManager, key: string, c: HTMLCanvasElement, fw: number, fh: number, n: number) {
  const tex = tm.addCanvas(key, c)!;
  for (let i = 0; i < n; i++) tex.add(i, 0, i * fw, 0, fw, fh);
}

/** Create all FX textures once per game. */
export function ensureFxTextures(scene: Phaser.Scene) {
  const tm = scene.textures;
  const lin = (key: string, c: HTMLCanvasElement) => {
    if (tm.exists(key)) return;
    tm.addCanvas(key, c)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  };
  // soft light: bright centre, long gaussian-ish tail
  lin(
    TX.glow,
    radial(64, (d) => (Math.exp(-d * d * 4.5) - Math.exp(-4.5)) / (1 - Math.exp(-4.5))),
  );
  // flat disc with a soft rim (clock face, panes)
  lin(TX.disc, radial(64, (d) => (d < 0.78 ? 1 : 1 - (d - 0.78) / 0.22)));
  // contact shadow: soft ellipse
  lin(TX.shadow, radial(32, (d) => Math.pow(Math.min(1, (1 - d) * 2.2), 1.3), [8, 6, 12], 0.5));
  // ember / mote
  lin(TX.ember, radial(8, (d) => Math.pow(Math.max(0, 1 - d), 1.4)));
  // haze: broad banks and a finer wisp layer
  lin(TX.fogA, fogCanvas(256, 7, [4, 8, 16], (n) => (n - 0.36) * 2.1));
  lin(TX.fogB, fogCanvas(256, 31, [8, 16, 32], (n) => (n - 0.42) * 2.4));
  if (!tm.exists(TX.hearth)) addSheet(tm, TX.hearth, hearthCanvas(), HEARTH.w, HEARTH.h, HEARTH.frames);
  if (!tm.exists(TX.rain)) {
    const { c, ctx } = canvas(1, 6);
    for (let y = 0; y < 6; y++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + (0.75 * y) / 5).toFixed(2)})`;
      ctx.fillRect(0, y, 1, 1);
    }
    tm.addCanvas(TX.rain, c);
  }
  if (!tm.exists(TX.brazier)) addSheet(tm, TX.brazier, hearthCanvas(BRAZIER), BRAZIER.w, BRAZIER.h, BRAZIER.frames);
  if (!tm.exists(TX.candle)) addSheet(tm, TX.candle, candleCanvas(), CANDLE.w, CANDLE.h, CANDLE.frames);
}
