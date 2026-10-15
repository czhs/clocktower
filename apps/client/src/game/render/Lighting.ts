// Lighting (docs/art-direction.md "Day and night"): the world is MULTIPLIED by an ambient colour
// per public phase, then a small ADDITIVE lift raises the floor toward Night blue so path, grass and
// architecture stay distinguishable. Warm light stamps are added into the multiply map.
//
// Bedtime moment (a ~10 s sequence from when this client sees the public phase change): the
// ambient eases down continuously, street lamps come on as a wave from the clock tower outward,
// household windows switch on in groups (one group per building, 0.4-0.8 s apart, 1.5 s fades) and
// a few households stay dark. Dawn restores the ambient first; lamps and windows go out after.
// Everything here is a function of the PUBLIC phase, public map data and avatars visible to us.
import * as Phaser from 'phaser';
import { townLayout } from '@ct/assets';
import ambientAnchors from '@ct/assets/generated/ambient.json';
import { reducedMotion } from '../fx/motion';
import type { LightSrc, PropRect } from './WorldMap';
import { GROUND_Y } from './projection';

const AMBIENT_OUT: Record<string, number> = {
  waiting: 0xf2ebe0,
  setup: 0xe8e0d8,
  day: 0xfcf4e6,
  bedtime: 0xb8949a,
  first_night: 0x58668c,
  night: 0x58668c,
  dawn: 0xc8aab0,
  finished: 0xfcf4e6,
};
// Interiors: ~12 % less general warm fill; secondary areas read cool, the room's practical lights
// (hearth, bar/counter/altar zone, candles) make one principal lit zone.
const AMBIENT_IN: Record<string, number> = {
  waiting: 0xcfcac8,
  setup: 0xcac5c4,
  day: 0xd0cbc8,
  bedtime: 0x9690a8,
  first_night: 0x6a6a86,
  night: 0x6a6a86,
  dawn: 0xa49cac,
  finished: 0xd0cbc8,
};
/** Additive floor (Night blue #243452 scaled) applied after the multiply. */
const LIFT_OUT: Record<string, number> = {
  waiting: 0,
  setup: 0,
  day: 0,
  bedtime: 0x07080e,
  first_night: 0x0e1626,
  night: 0x0e1626,
  dawn: 0x06080e,
  finished: 0,
};
const LIFT_IN: Record<string, number> = { ...LIFT_OUT, first_night: 0x0a0e1a, night: 0x0a0e1a };
export const LIGHT_TINT: Record<string, number> = { lamp: 0xffa452, warm: 0xffb868, cool: 0x8a9ad0, fire: 0xff9440, holy: 0xc89aff, lantern: 0xffc070, st: 0xffcf7a };
const NIGHT: ReadonlySet<string> = new Set(['first_night', 'night']);
const clock = ambientAnchors.clock as { x: number; y: number; r: number } | null | undefined;
/** Interior props that anchor a room's principal lit zone. */
const ZONE_PROPS = /^(bar|counter|altar)/;
const hash = (a: number, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export type Stamp = (x: number, y: number, r: number, color: number, alpha: number, soft?: number) => void;

export interface Carrier {
  x: number;
  y: number;
  st: boolean;
  lantern: boolean;
  mine: boolean;
}

export interface LightFrame {
  dt: number;
  phase: string;
  inside: boolean;
  here: string | null;
  view: { left: number; top: number; w: number; h: number };
  zoom: number;
  /** public phase progress 0..1 (null if unknown) and ms since we saw the phase begin */
  progress: number | null;
  sinceMs: number;
  /** avatars visible to us in our own location (and ourselves) */
  carriers: readonly Carrier[];
}

export class Lighting {
  readonly rt: Phaser.GameObjects.RenderTexture;
  private lift: Phaser.GameObjects.Rectangle;
  private ambient = { r: 0xf2, g: 0xeb, b: 0xe0 };
  private liftC = { r: 0, g: 0, b: 0 };
  /** bedtime switch-on time (s after bedtime starts; NaN = household stays dark) / dawn switch-off */
  private onAt = new Map<LightSrc, number>();
  private offAt = new Map<LightSrc, number>();
  private on = new Map<LightSrc, number>();
  private zones: { x: number; y: number; w: number; h: number; building: string }[] = [];
  private lastInside: boolean | null = null;
  private snapNext = false;
  /** Jump straight to the current phase's light (joining a game in progress). */
  snap() {
    this.snapNext = true;
  }
  private left = 0;
  private top = 0;
  private view = { w: 0, h: 0 };
  readonly stamp: Stamp;

  constructor(
    private scene: Phaser.Scene,
    private lights: readonly LightSrc[],
    props: readonly PropRect[] = [],
  ) {
    // Fixed-size light map (Phaser 3.90 RenderTexture.resize() breaks later draws); covers up to
    // 3200x2000 CSS px at the minimum zoom of 2.
    this.rt = scene.add.renderTexture(0, 0, 1600, 1000).setOrigin(0, 0).setScrollFactor(0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.lift = scene.add.rectangle(0, 0, 1600, 1000, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(5001).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.schedule();
    const TS = townLayout.tileSize;
    for (const p of props) {
      if (!ZONE_PROPS.test(p.frame)) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const b = townLayout.buildings.find((q) => {
        const r = q.interior;
        return cx >= r.x * TS && cx <= (r.x + r.w) * TS && cy >= r.y * TS && cy <= (r.y + r.h) * TS;
      });
      if (b) this.zones.push({ x: p.x, y: p.y, w: p.w, h: p.h, building: b.id });
    }
    const rt = this.rt;
    this.stamp = (x, y, r, color, alpha, soft = 0) => {
      if (alpha <= 0.01) return;
      const left = this.left;
      const top = this.top;
      if (x + r < left || y + r < top || x - r > left + this.view.w + 2 || y - r > top + this.view.h + 2) return;
      rt.stamp('lights', soft, x - left, y - top, { scale: (r * 2) / 128, tint: color, alpha: Math.min(1, alpha), blendMode: Phaser.BlendModes.ADD });
    };
  }

  /** Place the screen-fixed layers (call on zoom/resize). */
  place(origin: { x: number; y: number }) {
    this.rt.setPosition(origin.x, origin.y);
    this.lift.setPosition(origin.x, origin.y);
  }

  /** How far an outdoor lamp/window is switched on right now (0..1); fires and interiors: 1. */
  lampK(l: LightSrc): number {
    return this.on.get(l) ?? 1;
  }

  /**
   * Lamps: one wave from the clock tower outward (1-8 s). Windows: grouped per building (nearest
   * footprint), groups ordered by distance from the tower, switched 0.4-0.8 s apart from 2 s on;
   * ~18 % of cottages stay dark all night (tavern, chapel, shop always lit). Dawn: lamps and
   * windows go out from 6 s on, after the ambient has mostly recovered.
   */
  private schedule() {
    const TS = townLayout.tileSize;
    const cx = clock?.x ?? 0;
    const cy = clock?.y ?? 0;
    const dist = (l: { x: number; y: number }) => Math.hypot(l.x - cx, l.y - cy);
    const lamps = this.lights.filter((l) => !l.building && !l.facade && l.color !== 'fire');
    const maxD = Math.max(1, ...lamps.map(dist));
    for (const l of lamps) {
      const r = dist(l) / maxD;
      this.onAt.set(l, 1 + 7 * r);
      this.offAt.set(l, 6 + 5 * r);
    }
    const groups = new Map<string, LightSrc[]>();
    for (const l of this.lights) {
      if (l.building || !l.facade) continue;
      if (isClockFace(l)) {
        this.onAt.set(l, 1);
        this.offAt.set(l, 6);
        continue;
      }
      let best = '';
      let bd = Infinity;
      for (const b of townLayout.buildings) {
        const f = b.footprint;
        const dx = Math.max(f.x * TS - l.x, 0, l.x - (f.x + f.w) * TS);
        const dy = Math.max(f.y * TS - 4 * TS - l.y, 0, l.y - (f.y + f.h) * TS);
        const d = Math.hypot(dx, dy);
        if (d < bd) {
          bd = d;
          best = b.id;
        }
      }
      const g = groups.get(best) ?? [];
      g.push(l);
      groups.set(best, g);
    }
    const ordered = [...groups.entries()].sort((a, b) => dist(a[1][0]!) - dist(b[1][0]!));
    let t = 2;
    ordered.forEach(([id, ls], i) => {
      const kind = townLayout.buildings.find((b) => b.id === id)?.kind;
      const dark = kind === 'house' && hash(i, 41) < 0.18;
      for (const l of ls) {
        this.onAt.set(l, dark ? NaN : t);
        this.offAt.set(l, 6 + 5 * (i / Math.max(1, ordered.length - 1)));
      }
      t += 0.4 + 0.4 * hash(i, 7);
    });
  }

  private updateSwitches(f: LightFrame) {
    const night = NIGHT.has(f.phase);
    const s = f.sinceMs / 1000;
    for (const [l, on] of this.onAt) {
      let k: number;
      if (Number.isNaN(on)) k = 0;
      else if (night) k = 1;
      else if (f.phase === 'bedtime') k = Phaser.Math.Clamp((s - on) / 1.5, 0, 1);
      else if (f.phase === 'dawn') k = 1 - Phaser.Math.Clamp((s - this.offAt.get(l)!) / 2, 0, 1);
      else k = 0;
      // ease across phase jumps so nothing pops
      const cur = this.on.get(l) ?? k;
      this.on.set(l, cur + (k - cur) * Math.min(1, f.dt * 2.5));
    }
  }

  update(f: LightFrame) {
    const { inside, phase } = f;
    const target = (inside ? AMBIENT_IN : AMBIENT_OUT)[phase] ?? 0xffffff;
    const liftT = (inside ? LIFT_IN : LIFT_OUT)[phase] ?? 0;
    // continuous ~10 s ease on phase changes; going through a door (inside <-> outside) snaps
    const snap = this.snapNext || this.lastInside === null || this.lastInside !== inside;
    this.snapNext = false;
    this.lastInside = inside;
    const k = snap ? 1 : 1 - Math.exp(-f.dt * 0.25);
    const ease = (c: { r: number; g: number; b: number }, t: number) => {
      c.r += (((t >> 16) & 255) - c.r) * k;
      c.g += (((t >> 8) & 255) - c.g) * k;
      c.b += ((t & 255) - c.b) * k;
      return (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
    };
    const amb = ease(this.ambient, target);
    const lift = ease(this.liftC, liftT);
    this.lift.setVisible(lift !== 0);
    if (lift !== 0 && this.lift.fillColor !== lift) this.lift.setFillStyle(lift, 1);
    this.updateSwitches(f);
    const rt = this.rt;
    rt.clear();
    rt.fill(amb, 1);
    // RT origin = world (view.left - 1, view.top - 1) in the camera's screen-pixel-snapped scroll
    this.left = Math.round(f.view.left * f.zoom) / f.zoom - 1;
    this.top = Math.round(f.view.top * f.zoom * GROUND_Y) / (f.zoom * GROUND_Y) - 1;
    this.view = f.view;
    const night = NIGHT.has(phase);
    const dusk = phase === 'bedtime' || phase === 'dawn';
    const dark = night || dusk;
    const stamp = this.stamp;
    const now = this.scene.time.now;
    // slow, low-amplitude breathing (±6 %, independently phased); none with reduced motion
    const still = reducedMotion();
    const flicker = (x: number) => (still ? 1 : 0.94 + 0.06 * Math.sin(now / 900 + x * 0.37) * Math.sin(now / 1700 + x));
    for (const l of this.lights) {
      if (l.building !== f.here) continue;
      const tint = LIGHT_TINT[l.color] ?? LIGHT_TINT.warm!;
      if (inside) {
        // fire and candles warm their surroundings; window light is cool and dimmer at night
        if (l.color === 'cool') stamp(l.x, l.y + 6, l.r * 0.9, tint, night ? 0.18 : 0.42, 1);
        else {
          // practical lights: 1-2 tile local falloff (the hearth a little wider)
          const fl = flicker(l.x);
          const fire = l.color === 'fire' ? 1 : 0.6;
          const hearth = l.r >= 70;
          stamp(l.x, l.y + 6, hearth ? l.r * 1.05 : Math.min(30, l.r * 0.75), tint, (hearth ? 0.6 : 0.5) * fire * fl, 1);
          stamp(l.x, l.y, l.r * (hearth ? 0.45 : 0.3), tint, 0.55 * fire * fl, 0);
        }
      } else if (l.color === 'fire') {
        // brazier / bonfire: always burning, a warm pool
        const fl = flicker(l.x + l.y);
        stamp(l.x, l.y + 8, Math.min(48, l.r * 0.7), tint, (dark ? 0.85 : 0.35) * fl, 0);
        stamp(l.x, l.y - 2, 10, tint, (dark ? 0.7 : 0.25) * fl, 0);
      } else if (l.facade && isClockFace(l)) {
        // back-lit clock face: a soft cream glow that keeps the hands readable (never blown out)
        stamp(l.x, l.y, clock!.r + 2, 0xffe6c4, this.lampK(l) * (night ? 0.32 : 0.22), 1);
      } else if (l.facade) {
        // window: pane + warm response on the wall face around it (~0.75 tile), sill spill (~1 tile)
        const on = this.lampK(l) * (night ? 1 : 0.7);
        const fl = flicker(l.y);
        stamp(l.x, l.y + 2, 13, tint, on * 0.6 * fl, 1);
        stamp(l.x, l.y, 6, tint, on * 0.3 * fl);
        if (on > 0.05) stamp(l.x, l.y + 13, 15, tint, on * 0.2 * fl, 1);
      } else {
        // lamp: small head + a 2-3 tile pool centred on the ground around the post
        const on = 0.1 + 0.9 * this.lampK(l) * (night ? 1 : 0.85);
        const fl = flicker(l.x + l.y);
        const lt = l.color === 'warm' ? LIGHT_TINT.lamp! : tint;
        stamp(l.x, l.y + 30, 42, lt, on * 0.72 * fl, 1);
        stamp(l.x, l.y + 30, 22, lt, on * 0.3 * fl, 0);
        stamp(l.x, l.y, 10, lt, on * 0.6 * fl, 0);
      }
    }
    // the room's principal lit zone: warm light pooled over the bar / counter / altar
    if (inside)
      for (const z of this.zones) {
        if (z.building !== f.here) continue;
        stamp(z.x + z.w / 2, z.y + z.h / 2 + 4, Math.max(36, z.w * 0.75), LIGHT_TINT.warm!, night ? 0.5 : 0.32, 1);
      }
    // carried lights: storyteller lantern (nearby ground only, never a beacon), lantern accessories,
    // a faint cool moonlit aura on every visible villager (silhouettes separate from the ground)
    for (const c of f.carriers) {
      // Public night ambience must not encode a hidden visitor's position, including
      // on the Storyteller's own outdoor client. Carried light is private indoors.
      if (!inside && (night || phase === 'dawn')) continue;
      if (c.st) {
        stamp(c.x, c.y - 8, c.mine && dark ? 40 : 30, LIGHT_TINT.st!, dark ? 0.8 : 0.15, 0);
        stamp(c.x, c.y - 12, 8, LIGHT_TINT.st!, dark ? 0.6 : 0.1, 0);
      } else if (c.lantern) stamp(c.x, c.y - 8, 22, LIGHT_TINT.lantern!, dark ? 0.55 : 0.1, 0);
      if (dark && !inside && !c.st) stamp(c.x, c.y - 12, c.mine ? 28 : 16, 0x9aa4d8, c.mine ? 0.18 : 0.12, 1);
    }
  }
}

function isClockFace(l: LightSrc) {
  return !!clock && Math.hypot(l.x - clock.x, l.y - clock.y) <= clock.r;
}
