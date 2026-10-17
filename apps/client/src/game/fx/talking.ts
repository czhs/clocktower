// In-town "who is talking" indicator (OWNED BY voice; lives under game/fx at the lead's request,
// TownScene only has hook lines). Reads the voice client's `voicePresence` store, which already
// lists only people this client actually hears (debounced ~300 ms, not deafened, mic not muted,
// my volume for them > 0, in the street loud enough — so culled / far talkers are never in it).
// Draws only for avatars the scene is rendering anyway (`spriteOf` / `anchorOf` return null for
// anyone hidden), so it can never reveal a position or presence the town doesn't already show.
//
//   - the speaking character gets a crisp 1-px OUTLINE hugging its silhouette (pale gold; yourself:
//     rose while your mic transmits — dimmer while you're silent, full while you speak)
//   - a small 3-bar sound-wave glyph beside the name label
//   Outline depth is a player setting (Settings → "Talking outlines", ./talkingPref.ts):
//     behind (default): y-sorted just under the avatar, so buildings / props in front hide it like
//       the character itself; under the night lighting too (it is lit like the avatar).
//     top: above the lighting and every building (reads anywhere, also through walls).
//   The glyph follows the name label's rule in both modes: labels (5200) are always on top
//   (they already show through buildings), so the glyph next to the name stays on top too.
//
// The outline is a pixel-exact texture, not a blur: for each cast frame actually shown while someone
// talks, the frame's alpha is dilated by one pixel (8-neighbour) minus the silhouette itself, and
// the result is cached in one small atlas canvas (fixed slots, recycled when full). One Image per
// talker follows the avatar's frame, flip, scale, alpha (ghosts) and crop (the nick-face emote crops
// the head away: the outline is cropped the same way, so no phantom head).
//
// Cost: nothing while nobody talks (one length check per frame). While someone talks: one Image per
// talker with a few property syncs per frame; a new frame's outline costs one 32x40 getImageData and
// one texture upload, once. Low tier: the glyph doesn't animate.
import type * as Phaser from 'phaser';
import { voicePresence } from '../../voice/VoiceClient';
import type { RenderTier } from './tier';
import { readTalkOutlineMode, type TalkOutlineMode } from './talkingPref';

export interface TalkingAnchor {
  /** Feet (sprite origin), world px. */
  x: number;
  y: number;
  /** Right edge / vertical middle of the name label, world px (null = no label). */
  labelRight: number | null;
  labelMidY: number | null;
}

export interface TalkingCtx {
  myPid(): string | null;
  /** Visible avatars only; null for anyone the scene isn't rendering. */
  anchorOf(pid: string): TalkingAnchor | null;
  /** The avatar sprite, visible only (null otherwise). */
  spriteOf(pid: string): Phaser.GameObjects.Sprite | null;
  tier(): RenderTier;
}

export interface TalkingLayer {
  update(): void;
  destroy(): void;
}

const DEPTH_TOP = 5002; // 'top' mode: above lighting (5000), below pins (5100+), bubbles and labels (5200)
/** 'behind' mode: just under the avatar in the y-sort (its own sprite covers the inside). */
const BEHIND_EPS = 0.001;

/** Outline depth for a mode: y-sorted with the avatar (occluded by buildings in front) or on top. */
export function outlineDepth(mode: TalkOutlineMode, spriteDepth: number): number {
  return mode === 'top' ? DEPTH_TOP : spriteDepth - BEHIND_EPS;
}
const DEPTH_GLYPH = 5190;
const COLOR_TALK = 0xffe7a3; // pale gold
const COLOR_SELF = 0xff8f8a; // soft rose ("on air")
const COLOR_EDGE = 0x0b0812; // label stroke
const PULSE_MS = 900;
const PULSE_STEPS = 4;
/** Wave bar heights per pulse step (3 bars). */
const WAVE = [
  [2, 4, 3],
  [3, 2, 4],
  [4, 3, 2],
  [3, 4, 3],
];
const ATLAS_KEY = 'ct-talk-outline';
const ATLAS_W = 512;
const ATLAS_H = 512;
/** Alpha at or above this counts as part of the silhouette. */
const SOLID = 64;

/** Pulse step for a time (ms); the low tier stays on step 0. */
export function pulseStep(nowMs: number, tier: RenderTier): number {
  return tier === 'low' ? 0 : Math.floor(nowMs / (PULSE_MS / PULSE_STEPS)) % PULSE_STEPS;
}

/**
 * Outline mask for a w x h RGBA frame: (w+2) x (h+2) cells (1-px border), 1 where a transparent
 * pixel touches the silhouette (8-neighbour, or 4 with `diagonal` false), 0 elsewhere — never on
 * the silhouette itself.
 */
export function outlineMask(rgba: ArrayLike<number>, w: number, h: number, diagonal = true): Uint8Array {
  const W = w + 2;
  const H = h + 2;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3]! >= SOLID;
  const out = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      const x = X - 1;
      const y = Y - 1;
      if (solid(x, y)) continue;
      let hit = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!hit && diagonal) hit = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
      if (hit) out[Y * W + X] = 1;
    }
  return out;
}

/** Crop rect for the outline frame matching a crop of the w x h source frame (1-px border). */
export function outlineCrop(cx: number, cy: number, cw: number, ch: number, w: number, h: number): [number, number, number, number] {
  const x0 = cx <= 0 ? 0 : cx + 1;
  const y0 = cy <= 0 ? 0 : cy + 1;
  const x1 = cx + cw >= w ? w + 2 : cx + cw + 1;
  const y1 = cy + ch >= h ? h + 2 : cy + ch + 1;
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

/** Outline frames, built on demand into fixed atlas slots (all recycled at once when full). */
class OutlineAtlas {
  private tex: Phaser.Textures.CanvasTexture | null = null;
  private slotW = 0;
  private slotH = 0;
  private cols = 0;
  private slots = 0;
  private next = 0;
  private byFrame = new Map<string, string | null>();
  private scratch: HTMLCanvasElement | null = null;
  private dirty = false;
  constructor(private readonly scene: Phaser.Scene) {}

  /** Outline frame name for a sprite's current frame (null: can't outline it). */
  frameFor(frame: Phaser.Textures.Frame): string | null {
    const id = `${frame.texture.key}|${frame.name}`;
    const hit = this.byFrame.get(id);
    if (hit !== undefined) return hit;
    const name = this.build(frame);
    this.byFrame.set(id, name);
    return name;
  }

  get key() {
    return ATLAS_KEY;
  }

  /** Upload once per update, after any new frames. */
  flush() {
    if (this.dirty && this.tex) this.tex.refresh();
    this.dirty = false;
  }

  private ensure(fw: number, fh: number): boolean {
    if (this.tex) return fw + 2 <= this.slotW && fh + 2 <= this.slotH;
    const tm = this.scene.textures;
    if (tm.exists(ATLAS_KEY)) tm.remove(ATLAS_KEY);
    const tex = tm.createCanvas(ATLAS_KEY, ATLAS_W, ATLAS_H);
    if (!tex) return false;
    this.tex = tex;
    this.slotW = fw + 2;
    this.slotH = fh + 2;
    this.cols = Math.floor(ATLAS_W / this.slotW);
    this.slots = this.cols * Math.floor(ATLAS_H / this.slotH);
    for (let i = 0; i < this.slots; i++) tex.add(`s${i}`, 0, (i % this.cols) * this.slotW, Math.floor(i / this.cols) * this.slotH, this.slotW, this.slotH);
    return true;
  }

  private build(frame: Phaser.Textures.Frame): string | null {
    const w = frame.cutWidth;
    const h = frame.cutHeight;
    if (!w || !h || !this.ensure(w, h) || !this.tex) return null;
    const src = frame.source.image as CanvasImageSource | undefined;
    if (!src) return null;
    try {
      this.scratch ??= document.createElement('canvas');
      const sc = this.scratch;
      if (sc.width !== w || sc.height !== h) {
        sc.width = w;
        sc.height = h;
      }
      const c = sc.getContext('2d', { willReadFrequently: true });
      if (!c) return null;
      c.clearRect(0, 0, w, h);
      c.drawImage(src, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
      const mask = outlineMask(c.getImageData(0, 0, w, h).data, w, h);
      if (this.next >= this.slots) {
        // full: recycle every slot (frames rebuild on demand next time they're needed)
        this.next = 0;
        this.byFrame.clear();
        this.tex.context.clearRect(0, 0, ATLAS_W, ATLAS_H);
      }
      const i = this.next++;
      const ox = (i % this.cols) * this.slotW;
      const oy = Math.floor(i / this.cols) * this.slotH;
      const W = w + 2;
      const H = h + 2;
      const img = this.tex.context.createImageData(this.slotW, this.slotH);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (mask[y * W + x]) {
            const p = (y * this.slotW + x) * 4;
            img.data[p] = img.data[p + 1] = img.data[p + 2] = img.data[p + 3] = 255; // white: tinted per use
          }
      this.tex.context.putImageData(img, ox, oy);
      this.dirty = true;
      return `s${i}`;
    } catch {
      return null;
    }
  }

  destroy() {
    if (this.tex && this.scene.textures.exists(ATLAS_KEY)) this.scene.textures.remove(ATLAS_KEY);
    this.tex = null;
    this.byFrame.clear();
  }
}

interface CropData {
  cx: number;
  cy: number;
  cw: number;
  ch: number;
}

export function createTalkingLayer(scene: Phaser.Scene, ctx: TalkingCtx): TalkingLayer {
  const atlas = new OutlineAtlas(scene);
  const glyph = scene.add.graphics().setDepth(DEPTH_GLYPH);
  /** Outline images in use, by pid; spare ones are pooled hidden. */
  const live = new Map<string, Phaser.GameObjects.Image>();
  const pool: Phaser.GameObjects.Image[] = [];
  let speaking: string[] = voicePresence.get().speaking;
  let selfTx = voicePresence.get().selfTransmitting;
  let glyphKey = '';
  let mode = readTalkOutlineMode();
  let modeAt = 0;
  const off = voicePresence.subscribe((p) => {
    speaking = p.speaking;
    selfTx = p.selfTransmitting;
  });

  function release(pid: string) {
    const img = live.get(pid);
    if (!img) return;
    live.delete(pid);
    img.setVisible(false);
    pool.push(img);
  }

  function clear() {
    for (const pid of [...live.keys()]) release(pid);
    if (glyphKey !== '') {
      glyphKey = '';
      glyph.clear();
    }
  }

  /** Sync one outline image to its sprite; false when it can't be drawn. */
  function outline(pid: string, spr: Phaser.GameObjects.Sprite, color: number, alpha: number): boolean {
    const name = atlas.frameFor(spr.frame);
    if (!name) return false;
    let img = live.get(pid);
    if (!img) {
      img = pool.pop() ?? scene.add.image(0, 0, atlas.key, name);
      live.set(pid, img);
    }
    if (img.frame.name !== name) img.setFrame(name, false, false);
    img.setVisible(true).setPosition(spr.x, spr.y).setScale(spr.scaleX, spr.scaleY).setFlip(spr.flipX, spr.flipY);
    img.setDisplayOrigin(spr.displayOriginX + 1, spr.displayOriginY + 1);
    const depth = outlineDepth(mode, spr.depth);
    if (img.depth !== depth) img.setDepth(depth); // setDepth always queues a depth sort
    if (img.tintTopLeft !== color) img.setTint(color);
    img.setAlpha(alpha * spr.alpha);
    const w = spr.frame.cutWidth;
    const h = spr.frame.cutHeight;
    const crop = (spr as unknown as { isCropped: boolean; _crop?: CropData }).isCropped ? (spr as unknown as { _crop?: CropData })._crop : undefined;
    if (crop) img.setCrop(...outlineCrop(crop.cx, crop.cy, crop.cw, crop.ch, w, h));
    else if ((img as unknown as { isCropped: boolean }).isCropped) img.setCrop();
    return true;
  }

  function update() {
    const me = ctx.myPid();
    if (speaking.length === 0 && !(selfTx && me)) {
      if (live.size || glyphKey !== '') clear();
      return;
    }
    const t = performance.now();
    if (t >= modeAt) {
      modeAt = t + 1000; // Settings change applies live (re-read ~1/s, only while someone talks)
      mode = readTalkOutlineMode();
    }
    const step = pulseStep(t, ctx.tier());
    const keep = new Set<string>();
    const glyphs: { a: TalkingAnchor; color: number }[] = [];
    let key = `${step}`;
    const add = (pid: string, self: boolean, talk: boolean) => {
      const spr = ctx.spriteOf(pid);
      if (!spr || !spr.visible) return;
      const color = self ? COLOR_SELF : COLOR_TALK;
      if (outline(pid, spr, color, self && !talk ? 0.55 : 1)) keep.add(pid);
      if (!talk) return;
      const a = ctx.anchorOf(pid);
      if (!a) return;
      glyphs.push({ a, color });
      key += `|${Math.round(a.x)},${Math.round(a.y)},${a.labelRight === null ? '' : Math.round(a.labelRight)},${self ? 1 : 0}`;
    };
    for (const pid of speaking) if (pid !== me) add(pid, false, true);
    if (me && (selfTx || speaking.includes(me))) add(me, true, speaking.includes(me));
    for (const pid of [...live.keys()]) if (!keep.has(pid)) release(pid);
    atlas.flush();
    if (key === glyphKey) return;
    glyphKey = key;
    glyph.clear();
    for (const { a, color } of glyphs) {
      const gx = a.labelRight !== null ? Math.round(a.labelRight) + 2 : Math.round(a.x) + 9;
      const gy = a.labelMidY !== null ? Math.round(a.labelMidY) : Math.round(a.y) - 28;
      const bars = WAVE[step]!;
      glyph.fillStyle(COLOR_EDGE, 0.85);
      glyph.fillRect(gx - 1, gy - 3, 7, 7);
      glyph.fillStyle(color, 1);
      for (let i = 0; i < 3; i++) {
        const h = bars[i]!;
        glyph.fillRect(gx + i * 2, gy - Math.floor(h / 2), 1, h);
      }
    }
  }

  return {
    update,
    destroy() {
      off();
      for (const img of live.values()) img.destroy();
      for (const img of pool) img.destroy();
      live.clear();
      pool.length = 0;
      glyph.destroy();
      atlas.destroy();
    },
  };
}
