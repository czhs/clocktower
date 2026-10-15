// Fixed low-angle projection, smooth follow clamped to the current area, and an overlay
// camera drawing crisp labels and gameplay hints after the single colour-grade pass.
import * as Phaser from 'phaser';
import { CAMERA_ZOOM, GROUND_Y } from './projection';

/** Depth band rendered by the overlay camera only (labels 5200, gameplay hints 5150). */
export const OVERLAY_MIN = 5150;
export const OVERLAY_MAX = 5299;
/** follow stiffness (1/s): lower = lazier camera */
const FOLLOW_RATE = 5.5;

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class CameraRig {
  readonly view = { left: 0, top: 0, w: 0, h: 0, init: false };
  // One composition scale on every device. A resize reveals more/less of the world;
  // it never changes character size, perspective, or the authored lighting.
  readonly zoom = CAMERA_ZOOM;
  readonly overlay: Phaser.Cameras.Scene2D.Camera;
  private pending: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    offs: (() => void)[],
  ) {
    const main = scene.cameras.main;
    main.setBackgroundColor('#09070d');
    main.setRoundPixels(true);
    this.overlay = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height, false, 'overlay');
    this.overlay.setRoundPixels(true);
    const hide = (o: Phaser.GameObjects.GameObject) => {
      if ((o as { ctOverlay?: boolean }).ctOverlay) return;
      o.cameraFilter |= this.overlay.id;
      this.pending.push(o);
    };
    for (const o of scene.children.list) hide(o);
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, hide);
    offs.push(() => scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, hide));
  }

  /** Resizing reveals more or less world without changing the authored scale. */
  pickZoom(_w: number, _h: number): number {
    return this.zoom;
  }

  /** Apply zoom for the current canvas size; returns true when it changed. */
  applyZoom(): boolean {
    const z = this.pickZoom(this.scale.width, this.scale.height);
    const changed = z !== this.scene.cameras.main.zoomX || z * GROUND_Y !== this.scene.cameras.main.zoomY;
    this.scene.cameras.main.setZoom(z, z * GROUND_Y);
    this.view.init = false;
    return changed;
  }

  private get scale() {
    return this.scene.scale;
  }

  /** Top-left of a scrollFactor-0 object that should cover exactly the view (scaled about the camera centre). */
  screenOrigin(): { x: number; y: number } {
    const w = this.scale.width;
    const h = this.scale.height;
    return { x: (w - w / this.zoom) / 2 - 1, y: (h - h / (this.zoom * GROUND_Y)) / 2 - 1 };
  }

  /** Follow `target` (world px) inside `area`; snaps on the first frame after init=false. */
  follow(dt: number, target: { x: number; y: number }, area: Area) {
    const cam = this.scene.cameras.main;
    const zoom = this.zoom;
    const vw = cam.width / zoom;
    const vh = cam.height / (zoom * GROUND_Y);
    const clamp = (c: number, lo: number, size: number, view: number) => (size <= view ? lo + (size - view) / 2 : Phaser.Math.Clamp(c - view / 2, lo, lo + size - view));
    const left = clamp(target.x, area.x, area.w, vw);
    const top = clamp(target.y, area.y, area.h, vh);
    const v = this.view;
    if (!v.init) {
      v.left = left;
      v.top = top;
      v.init = true;
    } else {
      const k = 1 - Math.exp(-dt * FOLLOW_RATE);
      v.left += (left - v.left) * k;
      v.top += (top - v.top) * k;
    }
    // scroll in whole SCREEN pixels: smooth easing without sub-pixel shimmer
    const L0 = Math.round(v.left * zoom) / zoom;
    const T0 = Math.round(v.top * zoom * GROUND_Y) / (zoom * GROUND_Y);
    cam.setScroll(L0 - (cam.width - vw) / 2, T0 - (cam.height - vh) / 2);
    v.w = vw;
    v.h = vh;
  }

  /** Render a game object on the overlay camera only. */
  toOverlay(o: Phaser.GameObjects.GameObject) {
    (o as { ctOverlay?: boolean }).ctOverlay = true;
    o.cameraFilter = this.scene.cameras.main.id;
  }

  /** Mirror the main camera; route newly added objects in the overlay depth band. */
  sync() {
    if (this.pending.length) {
      for (const o of this.pending) {
        const d = (o as { depth?: number }).depth ?? 0;
        if (d >= OVERLAY_MIN && d <= OVERLAY_MAX && o.scene) this.toOverlay(o);
      }
      this.pending.length = 0;
    }
    const m = this.scene.cameras.main;
    const c = this.overlay;
    if (c.width !== m.width || c.height !== m.height) c.setSize(m.width, m.height);
    if (c.zoomX !== m.zoomX || c.zoomY !== m.zoomY) c.setZoom(m.zoomX, m.zoomY);
    c.setScroll(m.scrollX, m.scrollY);
  }

  /** Night falls: both cameras fade together. */
  fadeThrough(outMs: number, inMs: number, r: number, g: number, b: number) {
    for (const cam of [this.scene.cameras.main, this.overlay]) {
      cam.fadeOut(outMs, r, g, b);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => cam.fadeIn(inMs, r, g, b));
    }
  }
}
