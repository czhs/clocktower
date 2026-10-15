// Foreground layer: overhead dressing (boughs, bunting, arch spans, hanging signs/lanterns, laundry)
// from packages/assets/src/foreground.ts, drawn over the characters beneath them with a slight
// parallax and a soft depth-of-field blur (high quality). An element fades while a visible
// character is behind/under it, so nobody is ever hidden. Static public data only.
//
// Contract (foreground.ts): WORLD px, sprite bottom-left at (x, y), size w x h; depthBias = height
// above the ground point it hangs over (ground y = y + depthBias); parallax = extra scroll factor.
import * as Phaser from 'phaser';
import * as assets from '@ct/assets';
import type { FxQuality } from '../fx/quality';
import { OBJ_DENSITY } from './density';
import { UPRIGHT_Y } from './projection';

export interface ForegroundItem {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depthBias?: number;
  parallax?: number;
}

interface Fg {
  it: ForegroundItem;
  img: Phaser.GameObjects.Image;
  gy: number;
  p: number;
  k: number;
}

/** FOREGROUND from @ct/assets when exported (tolerates older asset packages). */
export function foregroundItems(): ForegroundItem[] {
  const list = (assets as unknown as { FOREGROUND?: ForegroundItem[] }).FOREGROUND;
  return Array.isArray(list) ? list : [];
}

/** Screen-edge framing (critique round 3): dark, soft foliage poking into two corners. */
interface Corner {
  img: Phaser.GameObjects.Image;
  /** which corner: top-left (else top-right); boughs hang in from above, clear of the HUD below */
  tl: boolean;
  k: number;
}

export class Foreground {
  private items: Fg[] = [];
  private corners: Corner[] = [];
  private quality: FxQuality = 'high';
  private trees: { x: number; y: number }[] = [];
  private lastView = { left: NaN, top: NaN };
  private sway = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, items: readonly ForegroundItem[], trees: readonly { x: number; y: number; w: number; h: number }[] = []) {
    const atlas = scene.textures.get('foreground-baked');
    for (const source of items) {
      const ground = source.y + (source.depthBias ?? 0);
      const it = { ...source, y: ground - (ground - source.y) * UPRIGHT_Y, h: source.h * UPRIGHT_Y, depthBias: (source.depthBias ?? 0) * UPRIGHT_Y };
      const frame = atlas.has(it.kind) ? it.kind : atlas.has(`fg_${it.kind}`) ? `fg_${it.kind}` : null;
      if (!frame) {
        if (import.meta.env.DEV) console.warn('[foreground] missing frame', it.kind);
        continue;
      }
      const gy = it.y + (it.depthBias ?? 0);
      const img = scene.add
        .image(it.x, it.y, 'foreground-baked', frame)
        .setOrigin(0, 1)
        .setScale(1 / OBJ_DENSITY, UPRIGHT_Y / OBJ_DENSITY)
        .setDepth(10 + gy + 0.5);
      this.items.push({ it, img, gy, p: it.parallax ?? 0.05, k: 1 });
    }
    this.trees = trees.map((t) => ({ x: t.x + t.w / 2, y: t.y + t.h }));
    const frames = ['fg_bough', 'fg_branch'].filter((f) => atlas.has(f));
    frames.slice(0, 2).forEach((frame, i) => {
      const tl = i === 0;
      const img = scene.add
        .image(0, 0, 'foreground-baked', frame)
        .setOrigin(tl ? 0 : 1, 0)
        .setScale(1.6 / OBJ_DENSITY)
        .setFlip(!tl, true)
        .setScrollFactor(0)
        .setDepth(4600)
        .setTint(0x6a6478)
        .setVisible(false);
      this.corners.push({ img, tl, k: 0 });
    });
  }

  setQuality(q: FxQuality) {
    this.quality = q;
  }

  /**
   * Parallax offset + fade. `bodies` are feet positions of characters visible to us outdoors.
   */
  update(dt: number, view: { left: number; top: number; w: number; h: number }, bodies: readonly { x: number; y: number }[], outdoors: boolean, origin: { x: number; y: number } = { x: 0, y: 0 }, still = false) {
    this.updateCorners(dt, view, bodies, outdoors, origin, still);
    const cx = view.left + view.w / 2;
    const cy = view.top + view.h / 2;
    const ke = 1 - Math.exp(-dt * 8);
    for (const f of this.items) {
      const { it } = f;
      const vis = outdoors && it.x + it.w > view.left - 64 && it.x < view.left + view.w + 64 && it.y > view.top - 64 && it.y - it.h < view.top + view.h + 64;
      f.img.setVisible(vis);
      if (!vis) continue;
      // nearer the camera than the ground: drifts a little further than the world as we pan
      const ox = (it.x + it.w / 2 - cx) * f.p;
      const oy = (it.y - it.h / 2 - cy) * f.p;
      const x = it.x + ox;
      const y = it.y + oy;
      f.img.setPosition(x, y);
      let behind = false;
      for (const b of bodies) {
        if (b.y > f.gy + 6) continue; // in front of the hanging point: drawn over it anyway
        if (b.x + 7 < x || b.x - 7 > x + it.w || b.y < y - it.h || b.y - 30 > y) continue;
        behind = true;
        break;
      }
      const target = behind ? 0.35 : 1;
      f.k = Math.abs(f.k - target) < 0.01 ? target : f.k + (target - f.k) * ke;
      f.img.setAlpha(f.k);
    }
  }

  /**
   * Corner framing: only where trees are near the view (never in the open square), off at low
   * quality. Visible part stays within ~4 % of the view per corner; it lags the camera slightly
   * (parallax) and fades whenever a visible character comes near it.
   */
  private updateCorners(dt: number, view: { left: number; top: number; w: number; h: number }, bodies: readonly { x: number; y: number }[], outdoors: boolean, origin: { x: number; y: number }, still: boolean) {
    if (!this.corners.length) return;
    const cx = view.left + view.w / 2;
    const cy = view.top + view.h / 2;
    let leafy = false;
    for (const t of this.trees)
      if (Math.abs(t.x - cx) < view.w / 2 + 60 && Math.abs(t.y - cy) < view.h / 2 + 60) {
        leafy = true;
        break;
      }
    const want = outdoors && leafy && this.quality !== 'low';
    // camera velocity -> a few px of lag in the opposite direction (near layer moves faster)
    const vx = Number.isNaN(this.lastView.left) || dt <= 0 ? 0 : (view.left - this.lastView.left) / dt;
    const vy = Number.isNaN(this.lastView.top) || dt <= 0 ? 0 : (view.top - this.lastView.top) / dt;
    this.lastView = { left: view.left, top: view.top };
    const ke = 1 - Math.exp(-dt * 3);
    const tx = still ? 0 : Math.max(-6, Math.min(6, -vx * 0.08));
    const ty = still ? 0 : Math.max(-4, Math.min(4, -vy * 0.08));
    this.sway.x += (tx - this.sway.x) * ke;
    this.sway.y += (ty - this.sway.y) * ke;
    const x0 = origin.x + 1;
    const y0 = origin.y + 1;
    for (const c of this.corners) {
      const img = c.img;
      const px = c.tl ? x0 - img.displayWidth * 0.32 : x0 + view.w + img.displayWidth * 0.32;
      const py = y0 - img.displayHeight * 0.36;
      img.setPosition(px + this.sway.x, py + this.sway.y);
      // visible rect in view-relative world px
      const rx0 = c.tl ? 0 : view.w - img.displayWidth * 0.68;
      const ry0 = 0;
      let near = false;
      for (const b of bodies) {
        const bx = b.x - view.left;
        const by = b.y - view.top;
        if (bx > rx0 - 10 && bx < rx0 + img.displayWidth * 0.68 + 10 && by > ry0 - 4 && by - 30 < ry0 + img.displayHeight * 0.64) {
          near = true;
          break;
        }
      }
      const target = !want ? 0 : near ? 0.2 : 0.85;
      c.k = Math.abs(c.k - target) < 0.01 ? target : c.k + (target - c.k) * (1 - Math.exp(-dt * 4));
      img.setVisible(c.k > 0.01).setAlpha(c.k);
    }
  }
}
