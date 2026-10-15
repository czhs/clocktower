// World map: tilemap layers, y-sorted map objects (density aware) and occlusion fading of
// roofs / towers / canopies. Light sources and prop rects are collected for the lighting and FX.
import * as Phaser from 'phaser';
import { townLayout } from '@ct/assets';
import objectsAtlas from '@ct/assets/generated/objects.json';
import bakedAtlas from '@ct/assets/generated/baked.json';
import { mapDensity, OBJ_DENSITY, tiledProp } from './density';
import { UPRIGHT_Y } from './projection';

const L = townLayout;
const TS = L.tileSize;
// Occlusion cutaway alpha of the upper part. ~0.5 left a villager behind the bright clock face
// practically invisible (muddy double image), so towers/roofs go a little further.
const FADE_BUILDING = 0.3;
const FADE_CANOPY = 0.42;

export interface LightSrc {
  x: number;
  y: number;
  r: number;
  color: string;
  building: string | null;
  facade: boolean;
  /** display depth / frame of the prop the light sits on (NaN / null if none) */
  depth: number;
  prop: string | null;
}

export interface PropRect {
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** display depth */
  d: number;
}

interface Occluder {
  top: Phaser.GameObjects.Image;
  base: Phaser.GameObjects.Image;
  x: number;
  y: number;
  w: number;
  split: number;
  line: number;
  k: number;
  building: boolean;
  clock: boolean;
  /** bottom of the sprite and the world y of its depth line (for covered()) */
  bottom: number;
  depthY: number;
}

export class WorldMap {
  private nightMix = 0;
  private phaseInitialized = false;
  private variants: { day: Phaser.GameObjects.Image; night: Phaser.GameObjects.Image }[] = [];
  private opacity = new Map<Phaser.GameObjects.Image, number>();
  readonly lights: LightSrc[] = [];
  readonly props: PropRect[] = [];
  /** texels per world px of town.json */
  readonly density: number;
  private occluders: Occluder[] = [];
  /** the clock tower's fading upper part (belfry + clock face) */
  clockTop: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene) {
    const map = scene.make.tilemap({ key: 'town' });
    const D = (this.density = mapDensity(map, TS));
    const terrain = map.addTilesetImage('terrain', 'terrain')!;
    const decor = map.addTilesetImage('decor', 'decor')!;
    map.createLayer('ground', terrain, 0, 0)!.setDepth(0).setScale(1 / D);
    map.createLayer('decor', decor, 0, 0)!.setDepth(1).setScale(1 / D);
    const atlas = scene.textures.get('objects');
    for (const [name, r] of Object.entries((objectsAtlas as unknown as { frames: Record<string, { x: number; y: number; w: number; h: number }> }).frames)) atlas.add(name, 0, r.x, r.y, r.w, r.h);
    for (const key of ['buildings-day', 'buildings-night']) {
      const tex = scene.textures.get(key);
      for (const [name, r] of Object.entries(bakedAtlas.buildings)) tex.add(name, 0, r.x, r.y, r.w, r.h);
    }
    const fg = scene.textures.get('foreground-baked');
    for (const [name, r] of Object.entries(bakedAtlas.foreground)) fg.add(name, 0, r.x, r.y, r.w, r.h);
    const OD = OBJ_DENSITY;
    const projected: { x: number; y: number; w: number; h: number; building: boolean }[] = [];
    for (const o of map.getObjectLayer('objects')?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      const p = (n: string) => tiledProp(o.properties, n);
      // every spatial value in town.json objects is in texels
      const x = o.x! / D;
      let y = o.y! / D;
      if (type === 'light') {
        this.lights.push({ x, y, r: Number(p('radius') ?? 40 * D) / D, color: String(p('color') ?? 'warm'), building: (p('building') as string) || null, facade: !!p('facade'), depth: NaN, prop: null });
        continue;
      }
      const w = o.width! / D;
      let h = o.height! / D;
      const frame = String(p('frame'));
      const depth = p('depth') !== undefined ? Number(p('depth')) / D : y + h;
      const d = type === 'flat' ? 2 : 10 + depth;
      const sy = type === 'flat' ? 1 : UPRIGHT_Y;
      if (sy !== 1) {
        projected.push({ x, y, w, h, building: type === 'building' });
        y = y + h - h * sy;
        h *= sy;
      }
      const baked = type === 'building' && scene.textures.get('buildings-day').has(frame);
      const texture = baked ? 'buildings-day' : 'objects';
      const img = scene.add.image(x, y, texture, frame).setOrigin(0, 0).setScale(1 / OD, sy / OD).setDepth(d);
      const variant = (day: Phaser.GameObjects.Image) => {
        if (!baked) return;
        const night = scene.add.image(x, y, 'buildings-night', frame).setOrigin(0, 0).setScale(1 / OD, sy / OD).setDepth(d + 0.001).setAlpha(0);
        this.variants.push({ day, night });
        return night;
      };
      const nightBase = variant(img);
      if (type === 'prop') this.props.push({ frame, x, y, w, h, d });
      // Tall things that can hide a character standing behind them get an upper part that fades.
      // Buildings: everything above the footprint rows; trees/tall props: the canopy (top ~70%).
      let split = 0; // world px from the image top that belong to the fading upper part
      let line = 0; // feet must be north of this world y for the upper part to count as "in front"
      if (type === 'building') {
        const b = L.buildings.find((q) => q.id === String(p('building') ?? ''));
        if (b) {
          split = Math.max(0, h - b.footprint.h * TS);
          line = depth - b.footprint.h * TS + 2;
        }
      } else if (type === 'prop' && h >= 40) {
        split = Math.round(h * 0.7);
        line = depth - 2;
      }
      if (split > 0) {
        // crop rects are in frame texels
        const fw = img.frame.width;
        const fh = img.frame.height;
        const s = Math.round(split * OD / sy);
        img.setCrop(0, s, fw, fh - s);
        nightBase?.setCrop(0, s, fw, fh - s);
        const top = scene.add.image(x, y, texture, frame).setOrigin(0, 0).setScale(1 / OD, sy / OD).setDepth(d).setCrop(0, 0, fw, Math.min(fh, s + 2));
        variant(top)?.setCrop(0, 0, fw, Math.min(fh, s + 2));
        const clock = type === 'building' && p('building') === 'clocktower';
        if (clock) this.clockTop = top;
        this.occluders.push({ top, base: img, x, y, w, split: y + split, line, k: 1, building: type === 'building', clock, bottom: y + h, depthY: depth });
      }
    }
    // which prop each light sits on (flame placement + depth)
    const FIXTURE = /^(fireplace|nightstand|candelabra|lamp|stainedglass|brazier)/;
    for (const l of this.lights) {
      const parent = projected.filter(p => p.building === l.facade && l.x >= p.x && l.x <= p.x + p.w && l.y >= p.y && l.y <= p.y + p.h).sort((a,b) => a.w*a.h-b.w*b.h)[0];
      if (parent) l.y = parent.y + parent.h - (parent.y + parent.h - l.y) * UPRIGHT_Y;
      const hits = this.props.filter((q) => l.x >= q.x && l.x <= q.x + q.w && l.y >= q.y && l.y <= q.y + q.h);
      const q = hits.find((c) => FIXTURE.test(c.frame)) ?? [...hits].sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (q) {
        l.depth = q.d;
        l.prop = q.frame.replace(/_b$/, '');
      }
    }
  }

  /** Subtle upper-layer drift, bounded so the overlapping split stays sealed. */
  parallax(view: { left: number; top: number; w: number; h: number }, still: boolean) {
    const cx = view.left + view.w / 2, cy = view.top + view.h / 2;
    let clock = { x: 0, y: 0 };
    for (const o of this.occluders) {
      const x = still ? 0 : Phaser.Math.Clamp((o.x + o.w / 2 - cx) * 0.006, -0.75, 0.75);
      const y = still ? 0 : Phaser.Math.Clamp((o.y - cy) * 0.001, -0.25, 0.25);
      o.top.setPosition(o.x + x, o.y + y);
      if (o.clock) clock = { x, y };
    }
    return clock;
  }

  /** Identically aligned day/night art; driven exclusively by the public phase. */
  updatePhase(phase: string, dt: number) {
    const target = phase === 'night' || phase === 'first_night' ? 1 : phase === 'bedtime' ? 0.8 : 0;
    const k = this.phaseInitialized ? 1 - Math.exp(-dt * 0.45) : 1;
    this.phaseInitialized = true;
    this.nightMix += (target - this.nightMix) * k;
    for (const pair of this.variants) {
      const alpha = this.opacity.get(pair.day) ?? 1;
      const n = alpha * this.nightMix;
      pair.day.setAlpha(n >= 1 ? 0 : (alpha - n) / (1 - n));
      pair.night.setPosition(pair.day.x, pair.day.y).setAlpha(n).setVisible(n > 0.001 && pair.day.visible);
    }
  }

  /**
   * Is a body (feet at x, y) completely hidden behind a building's opaque base? Its label must not
   * float over masonry then (the upper part fades instead, so this only happens behind the base).
   */
  covered(x: number, y: number): boolean {
    for (const o of this.occluders) {
      if (!o.building || y >= o.depthY) continue;
      if (x - 5 >= o.x && x + 5 <= o.x + o.w && y - 24 * UPRIGHT_Y >= o.split && y <= o.bottom) return true;
    }
    return false;
  }

  /**
   * Roofs, towers and tree canopies become see-through while a visible character's body is behind
   * them: the body box (feet minus ~28 px, ~12 px wide) overlaps the upper part and the feet are
   * north of the footprint top / the prop's base line. Only bodies we can already see count.
   * Returns the clock tower's upper-part alpha (the clock face/hands follow it).
   */
  fade(bodies: readonly { x: number; y: number }[], dt: number): number {
    // ~200 ms to settle (150-250 ms target)
    const k = 1 - Math.exp(-dt * 12);
    let clock = 1;
    for (const o of this.occluders) {
      let hidden = false;
      for (const b of bodies) {
        if (b.y >= o.line || b.x + 6 <= o.x || b.x - 6 >= o.x + o.w || b.y - 28 * UPRIGHT_Y >= o.split || b.y <= o.y) continue;
        hidden = true;
        break;
      }
      const target = hidden ? (o.building ? FADE_BUILDING : FADE_CANOPY) : 1;
      if (o.k !== target) {
        o.k = Math.abs(o.k - target) < 0.01 ? target : o.k + (target - o.k) * k;
        o.top.setAlpha(o.k);
        this.opacity.set(o.top, o.k);
        if (o.building) { o.base.setAlpha(o.k); this.opacity.set(o.base, o.k); }
      }
      if (o.clock) clock = o.k;
    }
    return clock;
  }
}
