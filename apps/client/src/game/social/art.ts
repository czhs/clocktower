// Textures for the social layer: pins (colour + the dropper's character icon), the pointing hand,
// the ping, the drop sparkle, the remove badge and the pin shadow.
//
// Art: packages/assets/generated/social.{png,json} (social-art agent), loaded optionally:
//   pin_<color> 18x26 (anchors.pin = tip; meta.pinIcon = icon disc {x,y,r,left,top})
//   icon_<castId> 12x12 round portraits · pin_shadow · pin_drop_0..3 · ping_0..3
//   point_<dir>_0..2 (8 dirs, meta.point {sequence, vectors, offset}) · emote_point (button icon)
// Without it every texture is drawn here as small pixel art, so the layer always works.
import type * as Phaser from 'phaser';
import type { PinColor } from '@ct/protocol';
import { socialUrl } from '@ct/assets/runtime';
import { drawCastPortrait } from '../../ui/common/castPortrait';
import { PIN_HEX } from './logic';

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };
export type Dir8 = 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left' | 'up' | 'up-right';
export const DIR8: readonly Dir8[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];

export interface SocialSheet {
  width?: number;
  height?: number;
  frames: Record<string, Rect>;
  meta?: {
    pinIcon?: { x?: number; y?: number; r?: number; left?: number; top?: number };
    anchors?: Record<string, Pt>;
    fps?: Record<string, number>;
    point?: { sequence?: number[]; vectors?: Record<string, [number, number]>; offset?: number };
    icons?: string[];
    /** The 'nick-face' emote: hide avatar frame rows above cropY; nick_face's anchor goes at feet + neck. */
    nickFace?: { cropY?: number; neck?: Pt };
  };
}

const ART_PNG: string | undefined = socialUrl;
const ART_JSON = Object.values(import.meta.glob('../../../../../packages/assets/generated/social.json', { eager: true, import: 'default' }) as Record<string, unknown>)[0] as SocialSheet | undefined;
/** For the DOM (dock / radial): the sheet URL + manifest, when the art exists. */
export const SOCIAL_SHEET: { url: string; json: SocialSheet } | null = ART_PNG && ART_JSON ? { url: ART_PNG, json: ART_JSON } : null;

const SHEET = 'social-art';

/** Fallback pin geometry (texels). */
const FB = { w: 26, h: 38, cx: 13, cy: 13, r: 12, disc: 9.5, tipY: 37 };

export interface PinGeom {
  w: number;
  h: number;
  /** Tip (frame-local px): the origin of a pin sprite. */
  tip: Pt;
  /** Head (icon disc) centre and hit radius (frame-local px). */
  head: { x: number; y: number; r: number };
}

/** A frame (or texture) plus its origin as fractions. */
export interface Piece {
  key: string;
  frame?: string;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export interface HandArt extends Piece {
  /** Art hands come pre-drawn in 8 directions (no rotation): play `anim`; else rotate the fallback. */
  directional: boolean;
  anim?: string;
  /** Distance from the emoter's head to the fist centre (world px). */
  offset: number;
}

export interface SocialArt {
  /** Texture key for a pin of `color` carrying `castId`'s icon (built on first use). */
  pin(color: PinColor, castId: string): string;
  pinGeom(): PinGeom;
  hand(dir: Dir8): HandArt;
  ping(): (Piece & { anim: string }) | null;
  drop(): (Piece & { anim: string }) | null;
  badge(): string;
  shadow(): Piece;
  /** Nick Song's 😝 head (null until the sheet is loaded): anchor = the neck. */
  nickFace(): (Piece & { cropY: number; neck: Pt }) | null;
  destroy(): void;
}

export function createSocialArt(scene: Phaser.Scene, onChange: () => void): SocialArt {
  let sheetReady = false;
  const built = new Set<string>();
  const bust = new Map<string, HTMLCanvasElement | null>();
  let dead = false;
  const M = ART_JSON?.meta;

  if (ART_PNG && ART_JSON) {
    if (scene.textures.exists(SHEET)) defineSheet();
    else {
      scene.load.image(SHEET, ART_PNG);
      scene.load.once(`filecomplete-image-${SHEET}`, () => {
        if (dead) return;
        defineSheet();
        for (const key of [...built]) {
          scene.textures.remove(key);
          built.delete(key);
        }
        onChange();
      });
      if (!scene.load.isLoading()) scene.load.start();
    }
  }

  function defineSheet() {
    const tex = scene.textures.get(SHEET);
    for (const [name, r] of Object.entries(ART_JSON!.frames)) if (!tex.has(name)) tex.add(name, 0, r.x, r.y, r.w, r.h);
    const fps = M?.fps ?? {};
    const seq = (p: string) =>
      Object.keys(ART_JSON!.frames)
        .filter((n) => new RegExp(`^${p}_\\d+$`).test(n))
        .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
    const make = (key: string, frames: string[], rate: number, repeat: number) => {
      if (frames.length && !scene.anims.exists(key)) scene.anims.create({ key, frames: frames.map((frame) => ({ key: SHEET, frame })), frameRate: rate, repeat });
    };
    make('social#ping', seq('ping'), fps.ping ?? 10, -1);
    make('social#drop', seq('pin_drop'), fps.pin_drop ?? 14, 0);
    const order = M?.point?.sequence ?? [0, 1, 2, 1];
    for (const d of DIR8) {
      const fr = seq(`point_${d}`);
      if (fr.length) make(`social#point-${d}`, order.map((i) => fr[Math.min(fr.length - 1, i)]!), fps.point ?? 8, -1);
    }
    sheetReady = true;
  }
  const has = (frame: string) => sheetReady && !!ART_JSON?.frames[frame];
  const anchor = (name: string, f: Rect, dflt: Pt): { ox: number; oy: number } => {
    const a = M?.anchors?.[name] ?? dflt;
    return { ox: a.x / f.w, oy: a.y / f.h };
  };

  function geom(): PinGeom {
    const f = ART_JSON?.frames.pin_gold;
    if (sheetReady && f) {
      const pi = M?.pinIcon ?? {};
      const tip = M?.anchors?.pin ?? { x: f.w / 2, y: f.h - 1 };
      const r = pi.r ?? f.w / 3;
      return { w: f.w, h: f.h, tip: { x: tip.x + 0.5, y: tip.y + 1 }, head: { x: pi.x ?? f.w / 2, y: pi.y ?? f.w / 2, r: Math.max(r + 2, f.w / 2) } };
    }
    return { w: FB.w, h: FB.h, tip: { x: FB.cx, y: FB.tipY + 1 }, head: { x: FB.cx, y: FB.cy, r: FB.r } };
  }

  /** Fallback icon: a bust cropped from cast.png (async; pins are redrawn when it arrives). */
  function ensureBust(castId: string) {
    if (bust.has(castId)) return;
    bust.set(castId, null);
    const c = document.createElement('canvas');
    void drawCastPortrait(c, castId, { crop: 'bust' }).then(() => {
      if (dead) return;
      bust.set(castId, c);
      for (const key of [...built]) if (key.endsWith(`|${castId}`)) redraw(key);
      onChange();
    });
  }

  function redraw(key: string) {
    const [, color, castId] = key.split('|') as [string, PinColor, string];
    const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext?.();
    if (!ctx) return;
    const g = geom();
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.imageSmoothingEnabled = false;
    const src = sheetReady ? (scene.textures.get(SHEET).getSourceImage() as CanvasImageSource) : null;
    const sheetPin = ART_JSON?.frames[`pin_${color}`];
    const iconFrame = ART_JSON?.frames[`icon_${castId}`];
    let disc: { x: number; y: number; r: number };
    if (src && sheetPin) {
      ctx.drawImage(src, sheetPin.x, sheetPin.y, sheetPin.w, sheetPin.h, 0, 0, sheetPin.w, sheetPin.h);
      const pi = M?.pinIcon ?? {};
      disc = { x: pi.x ?? g.head.x, y: pi.y ?? g.head.y, r: pi.r ?? 6 };
      if (iconFrame) {
        // the art's round portrait, 1:1 at the disc's top-left
        const left = pi.left ?? Math.round(disc.x - iconFrame.w / 2);
        const top = pi.top ?? Math.round(disc.y - iconFrame.h / 2);
        ctx.drawImage(src, iconFrame.x, iconFrame.y, iconFrame.w, iconFrame.h, left, top, iconFrame.w, iconFrame.h);
        tex.refresh();
        return;
      }
    } else {
      drawFallbackPin(ctx, color);
      disc = { x: FB.cx, y: FB.cy, r: FB.disc };
    }
    // no art icon: the bust from cast.png, clipped to the disc
    ensureBust(castId);
    ctx.save();
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2);
    ctx.clip();
    const b = bust.get(castId);
    if (b && b.width > 0) {
      const k = Math.min((disc.r * 2 + 2) / b.width, (disc.r * 2 + 2) / b.height);
      const s = k >= 1 ? Math.floor(k) : k;
      const w = b.width * s;
      const h = b.height * s;
      ctx.drawImage(b, Math.round(disc.x - w / 2), Math.round(disc.y - h / 2 + disc.r * 0.1), w, h);
    } else {
      ctx.fillStyle = '#5a4a3e';
      ctx.beginPath();
      ctx.arc(disc.x, disc.y - 1, disc.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(disc.x - disc.r * 0.6, disc.y + disc.r * 0.45, disc.r * 1.2, disc.r);
    }
    ctx.restore();
    tex.refresh();
  }

  return {
    pin(color, castId) {
      const key = `social-pin|${color}|${castId}`;
      if (built.has(key) && scene.textures.exists(key)) return key;
      const g = geom();
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.createCanvas(key, g.w, g.h);
      built.add(key);
      redraw(key);
      return key;
    },
    pinGeom: geom,
    hand(dir) {
      const name = `point_${dir}_0`;
      if (has(name) && scene.anims.exists(`social#point-${dir}`)) {
        const f = ART_JSON!.frames[name]!;
        return { key: SHEET, frame: name, ...anchor('point', f, { x: f.w / 2, y: f.h / 2 }), w: f.w, h: f.h, directional: true, anim: `social#point-${dir}`, offset: M?.point?.offset ?? 14 };
      }
      const key = patternTexture(scene, 'social-hand', HAND, HAND_PAL);
      return { key, ox: 0.15, oy: 0.4, w: HAND[0]!.length, h: HAND.length, directional: false, offset: 12 };
    },
    ping() {
      const f = ART_JSON?.frames.ping_0;
      if (!f || !scene.anims.exists('social#ping')) return null;
      return { key: SHEET, frame: 'ping_0', ...anchor('ping', f, { x: f.w / 2, y: f.h / 2 }), w: f.w, h: f.h, anim: 'social#ping' };
    },
    drop() {
      const f = ART_JSON?.frames.pin_drop_0;
      if (!f || !scene.anims.exists('social#drop')) return null;
      return { key: SHEET, frame: 'pin_drop_0', ...anchor('pin_drop', f, { x: f.w / 2, y: f.h - 2 }), w: f.w, h: f.h, anim: 'social#drop' };
    },
    badge: () => patternTexture(scene, 'social-badge', BADGE, BADGE_PAL),
    nickFace() {
      const f = ART_JSON?.frames.nick_face;
      if (!f || !has('nick_face')) return null;
      const nf = M?.nickFace ?? {};
      return { key: SHEET, frame: 'nick_face', ...anchor('nick_face', f, { x: f.w / 2, y: f.h - 1 }), w: f.w, h: f.h, cropY: nf.cropY ?? 24, neck: nf.neck ?? { x: 0, y: -13 } };
    },
    shadow() {
      const f = ART_JSON?.frames.pin_shadow;
      if (has('pin_shadow') && f) return { key: SHEET, frame: 'pin_shadow', ...anchor('pin_shadow', f, { x: f.w / 2, y: f.h / 2 }), w: f.w, h: f.h };
      const key = 'social-shadow';
      if (!scene.textures.exists(key)) {
        const t = scene.textures.createCanvas(key, 14, 6)!;
        const c = t.getContext();
        for (let y = 0; y < 6; y++)
          for (let x = 0; x < 14; x++) {
            const d = Math.hypot((x + 0.5 - 7) / 7, (y + 0.5 - 3) / 3);
            if (d <= 1) {
              c.fillStyle = `rgba(10,6,16,${d < 0.6 ? 0.45 : 0.25})`;
              c.fillRect(x, y, 1, 1);
            }
          }
        t.refresh();
      }
      return { key, ox: 0.5, oy: 0.5, w: 14, h: 6 };
    },
    destroy() {
      dead = true;
    },
  };
}

/** The fallback pin: a round head in the pin colour with a cream icon disc, on a short needle. */
function drawFallbackPin(ctx: CanvasRenderingContext2D, color: PinColor) {
  const hex = PIN_HEX[color];
  const outline = color === 'black' ? '#a49cb4' : '#140d14';
  const img = ctx.createImageData(FB.w, FB.h);
  const put = (x: number, y: number, css: string) => {
    const n = parseInt(css.slice(1), 16);
    const i = (y * FB.w + x) * 4;
    img.data[i] = (n >> 16) & 255;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < FB.h; y++)
    for (let x = 0; x < FB.w; x++) {
      const px = x + 0.5 - FB.cx;
      const py = y + 0.5 - FB.cy;
      const d = Math.hypot(px, py);
      const ny0 = FB.cy + FB.r - 3;
      if (y >= ny0 && y <= FB.tipY && d > FB.r - 1) {
        const t = (y - ny0) / (FB.tipY - ny0);
        const half = 3 - 2.5 * t;
        const ax = Math.abs(px);
        if (ax <= half - 1) put(x, y, px < 0 ? hex.fill : hex.dark);
        else if (ax <= half + 0.01) put(x, y, outline);
        continue;
      }
      if (d > FB.r) continue;
      if (d > FB.r - 1.2) put(x, y, outline);
      else if (d > FB.disc + 1) put(x, y, px + py < -FB.r * 0.55 ? hex.light : px + py > FB.r * 0.6 ? hex.dark : hex.fill);
      else if (d > FB.disc) put(x, y, hex.dark);
      else put(x, y, '#f3ead2');
    }
  ctx.putImageData(img, 0, 0);
}

// a gloved hand pointing right (fallback art)
const HAND = [
  '.....##..........',
  '....#ww#.........',
  '..###ww#########.',
  '.#wwwwwwwwwwwwww#',
  '.#wwwwww########.',
  '.#wwwwww#ss#.....',
  '.#swwwww###......',
  '.#swwwww#ss#.....',
  '..#sswww###......',
  '...######........',
];
const HAND_PAL: Record<string, string> = { '#': '#24160f', w: '#f6eedc', s: '#c9b48e' };
const BADGE = ['..#####..', '.#rrrrr#.', '#rwrrrwr#', '#rrwrwrr#', '#rrrwrrr#', '#rrwrwrr#', '#rwrrrwr#', '.#rrrrr#.', '..#####..'];
const BADGE_PAL: Record<string, string> = { '#': '#1a0c10', r: '#c8343f', w: '#ffffff' };

function patternTexture(scene: Phaser.Scene, key: string, rows: string[], pal: Record<string, string>): string {
  if (scene.textures.exists(key)) return key;
  const w = Math.max(...rows.map((r) => r.length));
  const t = scene.textures.createCanvas(key, w, rows.length)!;
  const c = t.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]!];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  });
  t.refresh();
  return key;
}
