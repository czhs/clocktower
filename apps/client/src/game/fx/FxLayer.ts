// HD-2D style atmosphere for the town (OWNED BY world-art / assets-fx), driven by TownScene.
//
//  - additive glow sprites + halos on lamps, lit windows, stained glass, hearths, candles, the
//    clock face (drawn after the multiply lighting so they really glow and feed the bloom pass);
//    lamps/windows follow the bedtime switch-on sequence from render/Lighting
//  - the bell moment: both belfry bells swing while the public 'bell'/'toll' cue plays
//  - slow cloud shadows by day, an occasional gentle drizzle (deterministic wall-clock windows)
//  - animated pixel flames on every 'fire' light, ember particles rising from fires, sparse
//    drifting embers / chimney sparks outdoors at dusk and night, dust motes in interior sunbeams
//  - two layered, slowly drifting haze textures (dense at night and dawn, thin by day); light
//    halos sit above the haze so pools glow through it
//  - soft contact shadows under trees, falling leaves from autumn-coloured trees
//  - the per-phase colour grade (bloom, tilt-shift DOF, vignette) via GradePipeline
//
// Privacy: everything here is a function of the wall clock, the PUBLIC phase, public map data,
// and the local camera. Nothing is derived from other entities (hidden or not), except the rim/
// shadow query lightAt(), which TownScene calls only for avatars visible to us.
import * as Phaser from 'phaser';
import { anchors } from '../render/anchors';
import { UPRIGHT_Y } from '../render/projection';
import { GRADE_PIPELINE, GradePipeline } from './GradePipeline';
import { cloneGrade, easeGrade, GRADES, interiorGrade, type Grade } from './grades';
import type { FxQuality } from './quality';
import { OBJ_DENSITY } from '../render/density';
import { townLayout, townMap } from '@ct/assets';
import { reducedMotion } from './motion';
import { BRAZIER, CANDLE, ensureFxTextures, HEARTH, TX } from './textures';

export interface FxLight {
  x: number;
  y: number;
  r: number;
  color: string;
  building: string | null;
  facade: boolean;
  /** display depth of the prop the light sits on (NaN if none) */
  depth: number;
  /** frame name of that prop (fireplace, nightstand, candelabra, lamp, ...) */
  prop: string | null;
}

export interface FxProp {
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FxFrame {
  t: number;
  dt: number;
  phase: string;
  night: boolean;
  dusk: boolean;
  inside: boolean;
  here: string | null;
  view: { left: number; top: number; w: number; h: number };
  /** clock tower upper-part occlusion alpha */
  clockAlpha: number;
}

export interface LightHit {
  k: number;
  dx: number;
  dy: number;
  color: number;
}

// layer depths (lighting RT is 5000, its lift 5001, labels 5200 on their own camera, mask 5300)
const D_HAZE = 5002;
const D_GLOW = 5003;
const D_MOTES = 5004;
const D_EMBERS = 5005;
const D_SHADOW = 2.5;
const D_LEAVES = 3999;
const D_CLOUDS = 4990;
/** The two belfry bells, relative to the clock tower sprite's top-left (world px). */
const BELLS = [
  { x: 19, y: 59, w: 14, h: 19 },
  { x: 47, y: 59, w: 14, h: 19 },
];

type GlowKind = 'lamp' | 'window' | 'holyWin' | 'hearth' | 'candle' | 'coolIn' | 'holyIn' | 'fireOut';
interface Glow {
  kind: GlowKind;
  l: FxLight;
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image | null;
  seed: number;
}
interface Flame {
  img: Phaser.GameObjects.Image;
  cur: number;
  l: FxLight;
  hearth: boolean;
  /** frame count of its sheet */
  n: number;
  seed: number;
}
interface Tree {
  p: FxProp;
  shadow: Phaser.GameObjects.Image;
  leaves: number[] | null;
}

const TREE = /^(pine|pinetall|oak|oak2|fruittree|willow|yew|deadtree|bush|bushberry)(_b)?$/;

const hash = (a: number, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const lerpColor = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const FOG: Record<string, { c: number; a: number }> = {
  waiting: { c: 0xf2e2c4, a: 0.07 },
  setup: { c: 0xeee6d6, a: 0.08 },
  day: { c: 0xf2e6cc, a: 0.07 },
  finished: { c: 0xf2e6cc, a: 0.07 },
  bedtime: { c: 0x8a7480, a: 0.14 },
  first_night: { c: 0x323a50, a: 0.16 },
  night: { c: 0x323a50, a: 0.16 },
  dawn: { c: 0xcfa8ae, a: 0.24 },
};

export class FxLayer {
  quality: FxQuality = 'high';
  private glows: Glow[] = [];
  private flames: Flame[] = [];
  private trees: Tree[] = [];
  private clockDisc: Phaser.GameObjects.Image | null = null;
  private clockHalo: Phaser.GameObjects.Image | null = null;
  private clouds: Phaser.GameObjects.TileSprite;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainK = 0;
  private bells: { cover: Phaser.GameObjects.Rectangle; bell: Phaser.GameObjects.Image; seed: number }[] = [];
  private bellUntil = 0;
  private lastInside: boolean | null = null;
  private snapNext = false;
  /** Jump straight to the current phase's grade/haze (joining a game in progress). */
  snap() {
    this.snapNext = true;
  }
  private still = false;
  /** ground-fog bands: soft patches drifting along garden walls, cemetery fences, street ends */
  private bands: { img: Phaser.GameObjects.Image; x0: number; len: number; y: number; speed: number; phase: number; a: number }[] = [];
  private fogA: Phaser.GameObjects.TileSprite;
  private fogB: Phaser.GameObjects.TileSprite;
  private fogC = 0xf2e2c4;
  private fogK = 0.07;
  private leaves: Phaser.GameObjects.Graphics;
  private fireEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private airEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private moteEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireSrc: { x: number; y: number; w: number }[] = [];
  private airSrc: { x: number; y: number }[] = [];
  private moteSrc: { x: number; y: number }[] = [];
  private viewRect = { left: 0, top: 0, w: 0, h: 0 };
  private darkK = 0;
  private here: string | null = null;
  private grade: Grade = cloneGrade(GRADES.waiting!);
  private pipeline: GradePipeline | null = null;
  private readonly webgl: boolean;

  constructor(
    private scene: Phaser.Scene,
    private lights: FxLight[],
    props: FxProp[],
    /** low quality falls back to AmbientLayer's cheap fog blobs + image vignette */
    private fallback: (on: boolean) => void,
    /** bedtime/dawn switch state of an outdoor lamp or window (render/Lighting.lampK) */
    private lampK: (l: FxLight) => number = () => 1,
  ) {
    ensureFxTextures(scene);
    this.webgl = scene.renderer.type === Phaser.WEBGL;
    const add = (x: number, y: number, r: number, depth = D_GLOW) =>
      scene.add.image(x, y, TX.glow).setDisplaySize(r * 2, r * 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setVisible(false);

    // --- glows + flames
    for (const l of lights) {
      const seed = hash(Math.round(l.x), Math.round(l.y)) * 100;
      const kind = glowKind(l);
      let core: Phaser.GameObjects.Image;
      let halo: Phaser.GameObjects.Image | null = null;
      switch (kind) {
        case 'lamp':
          core = add(l.x + 0.5, l.y + 2, 6).setTint(0xf0b85f);
          halo = add(l.x + 0.5, l.y + 26, 30).setTint(0xd98043);
          break;
        case 'fireOut':
          core = add(l.x, l.y - 4, 7).setTint(0xf0b85f);
          halo = add(l.x, l.y + 2, 28).setTint(0xd98043);
          break;
        case 'window':
          core = add(l.x, l.y + 1, 7).setTint(0xf0b85f);
          halo = add(l.x, l.y + 5, 18).setTint(0xd98043);
          break;
        case 'holyWin':
          core = add(l.x, l.y + 1, 9).setTint(0xb890e8);
          halo = add(l.x, l.y + 6, 22).setTint(0x7a5cc8);
          break;
        case 'hearth':
          core = add(l.x, l.y - 2, 9).setTint(0xf0b85f);
          halo = add(l.x, l.y + 4, 40).setTint(0xd98043);
          break;
        case 'candle':
          core = add(l.x, l.y - 3, 4).setTint(0xf0b85f);
          halo = add(l.x, l.y + 2, 16).setTint(0xd98043);
          break;
        case 'coolIn':
          core = add(l.x, l.y + 12, 22, D_MOTES - 0.5);
          break;
        case 'holyIn':
          core = add(l.x, l.y, 16).setTint(0xc8a0ff);
          halo = add(l.x, l.y + 14, 30).setTint(0x7a60e0);
          break;
      }
      this.glows.push({ kind, l, core, halo, seed });
      if (l.color === 'fire') this.addFlames(l, seed);
    }
    if (anchors.clock) {
      const c = anchors.clock;
      this.clockDisc = scene.add.image(c.x + 0.5, c.y + 0.5, TX.disc).setDisplaySize(c.r * 2, c.r * 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setTint(0xe8d8b0).setVisible(false);
      this.clockHalo = add(c.x + 0.5, c.y + 0.5, c.r + 8).setTint(0xf0b85f);
    }

    // --- tree shadows + autumn leaves
    const leafCache = new Map<string, number[] | null>();
    for (const p of props) {
      if (!TREE.test(p.frame)) continue;
      const bush = p.frame.startsWith('bush');
      const w = p.w * (bush ? 0.8 : 0.78);
      const shadow = scene.add
        .image(p.x + p.w / 2 + (bush ? 3 : 6), p.y + p.h - (bush ? 1 : 2), TX.shadow)
        .setDisplaySize(w * (bush ? 1 : 1.15), Math.max(6, w * 0.38))
        .setDepth(D_SHADOW)
        .setAlpha(0.4);
      if (!leafCache.has(p.frame)) leafCache.set(p.frame, bush ? null : autumnPalette(scene, p.frame));
      this.trees.push({ p, shadow, leaves: leafCache.get(p.frame) ?? null });
    }
    this.leaves = scene.add.graphics().setDepth(D_LEAVES);
    // slow cloud shadows drifting over the town by day (below the lighting so night hides them)
    this.clouds = scene.add.tileSprite(0, 0, 640, 400, TX.fogA).setOrigin(0, 0).setScrollFactor(0).setDepth(D_CLOUDS).setTint(0x1c1a2c).setVisible(false);
    this.clouds.setTileScale(5, 3.6);
    this.rain = scene.add.particles(0, 0, TX.rain, {
      lifespan: { min: 380, max: 620 },
      speedY: { min: 170, max: 210 },
      speedX: { min: -46, max: -36 },
      rotate: 12,
      alpha: { start: 0.42, end: 0.2 },
      tint: 0xc4d2ea,
      frequency: 1000,
      emitting: false,
      maxAliveParticles: 140,
      emitZone: { type: 'random', source: { getRandomPoint: (pt: Phaser.Types.Math.Vector2Like) => this.pickRain(pt) } },
    });
    this.rain.setDepth(D_EMBERS);
    this.makeGroundFog();


    // --- haze (screen-sized tile sprites, world-anchored scroll)
    this.fogA = scene.add.tileSprite(0, 0, 640, 400, TX.fogA).setOrigin(0, 0).setScrollFactor(0).setDepth(D_HAZE).setVisible(false);
    this.fogB = scene.add.tileSprite(0, 0, 640, 400, TX.fogB).setOrigin(0, 0).setScrollFactor(0).setDepth(D_HAZE).setVisible(false);
    this.fogA.setTileScale(2.2, 1.6);
    this.fogB.setTileScale(1.3, 1.0);

    // --- particles
    const sinFade = (t: number) => Math.sin(Math.PI * t);
    this.fireEm = scene.add.particles(0, 0, TX.ember, {
      lifespan: { min: 900, max: 2100 },
      speedY: { min: -24, max: -9 },
      speedX: { min: -5, max: 5 },
      accelerationX: { min: -9, max: 9 },
      scale: { start: 0.55, end: 0.1 },
      alpha: { start: 1, end: 0 },
      tint: [0xffe6a8, 0xffb850, 0xff8838, 0xff5a28],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 1000,
      emitting: false,
      maxAliveParticles: 90,
      emitZone: { type: 'random', source: { getRandomPoint: (pt: Phaser.Types.Math.Vector2Like) => this.pickFire(pt) } },
    });
    this.fireEm.setDepth(D_EMBERS);
    this.airEm = scene.add.particles(0, 0, TX.ember, {
      lifespan: { min: 3200, max: 6500 },
      speedY: { min: -13, max: -4 },
      speedX: { min: 1, max: 8 },
      accelerationX: { min: -4, max: 4 },
      scale: { min: 0.32, max: 0.7 },
      alpha: { start: 0, end: 1, ease: sinFade },
      tint: [0xff5038, 0xff6a3c, 0xff8a48, 0xffb060],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 1000,
      emitting: false,
      maxAliveParticles: 60,
      emitZone: { type: 'random', source: { getRandomPoint: (pt: Phaser.Types.Math.Vector2Like) => this.pickAir(pt) } },
    });
    this.airEm.setDepth(D_EMBERS);
    this.moteEm = scene.add.particles(0, 0, TX.ember, {
      lifespan: { min: 4000, max: 7500 },
      speedY: { min: -3, max: 3 },
      speedX: { min: -3, max: 3 },
      scale: { min: 0.18, max: 0.32 },
      alpha: { start: 0, end: 0.7, ease: sinFade },
      tint: 0xfff0d0,
      blendMode: Phaser.BlendModes.ADD,
      frequency: 1000,
      emitting: false,
      maxAliveParticles: 50,
      emitZone: { type: 'random', source: { getRandomPoint: (pt: Phaser.Types.Math.Vector2Like) => this.pickMote(pt) } },
    });
    this.moteEm.setDepth(D_MOTES);
    this.applyQuality();
  }

  private addFlames(l: FxLight, seed: number) {
    const depth = Number.isFinite(l.depth) ? l.depth + 0.3 : 10 + l.y + 4;
    const add = (x: number, y: number, hearth: boolean, s: number) => {
      const img = this.scene.add
        .image(x, y, hearth ? TX.hearth : TX.candle, 0)
        .setOrigin(0, 1)
        .setDepth(depth)
        .setVisible(false);
      this.flames.push({ img, l, hearth, n: hearth ? HEARTH.frames : CANDLE.frames, seed: seed + s, cur: 0 });
      return img;
    };
    // flame boxes measured on the props (packages/assets objects atlas)
    if (l.prop === 'brazier') {
      add(l.x - 4, l.y, true, 0).setTexture(TX.brazier, 0);
      this.flames[this.flames.length - 1]!.n = BRAZIER.frames;
    } else if (l.prop === 'fireplace' || (!l.prop && l.r >= 70)) add(l.x - 6, l.y + 3, true, 0);
    else if (l.prop === 'candelabra') [-4, 1, 5].forEach((dx, i) => add(l.x + dx - 1, l.y + 2, false, i * 1.7));
    else if (l.prop === 'nightstand') add(l.x - 1, l.y - 1, false, 0);
    else if (!l.building) add(l.x - 6, l.y + 3, true, 0); // outdoor brazier / bonfire
    else add(l.x - 1, l.y, false, 0);
  }

  // ---------------------------------------------------------------------------------------

  setQuality(q: FxQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
  }

  private applyQuality() {
    const cam = this.scene.cameras.main;
    const wantPost = this.webgl && this.quality !== 'low';
    if (wantPost && !this.pipeline) {
      const r = this.scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      if (!r.pipelines.postPipelineClasses.has(GRADE_PIPELINE)) r.pipelines.addPostPipeline(GRADE_PIPELINE, GradePipeline);
      cam.setPostPipeline(GRADE_PIPELINE);
      const p = cam.getPostPipeline(GRADE_PIPELINE);
      this.pipeline = (Array.isArray(p) ? p[0] : p) as GradePipeline;
    } else if (!wantPost && this.pipeline) {
      cam.removePostPipeline(GRADE_PIPELINE);
      this.pipeline = null;
    }
    if (this.pipeline) {
      this.pipeline.grade = this.grade;
    }
    this.fallback(this.quality === 'low');
  }

  private particleMul() {
    return this.quality === 'low' ? 0.35 : 1;
  }

  // ---------------------------------------------------------------------------------------
  // particle sources (called by the emitters)

  private pickFire(pt: Phaser.Types.Math.Vector2Like) {
    const s = this.fireSrc[Math.floor(Math.random() * this.fireSrc.length)];
    if (!s) return;
    pt.x = s.x + (Math.random() - 0.5) * s.w;
    pt.y = s.y;
  }
  private pickAir(pt: Phaser.Types.Math.Vector2Like) {
    const v = this.viewRect;
    // most embers stay near chimneys / fires; only a few stray ones in open air
    const s = this.airSrc.length && Math.random() < 0.85 ? this.airSrc[Math.floor(Math.random() * this.airSrc.length)] : null;
    if (s) {
      pt.x = s.x + (Math.random() - 0.5) * 4;
      pt.y = s.y - 2;
    } else {
      pt.x = v.left + Math.random() * v.w;
      pt.y = v.top + v.h * (0.25 + Math.random() * 0.8);
    }
  }
  private pickRain(pt: Phaser.Types.Math.Vector2Like) {
    const v = this.viewRect;
    pt.x = v.left + Math.random() * (v.w + 60);
    pt.y = v.top - 10 + Math.random() * v.h * 0.9;
  }
  private pickMote(pt: Phaser.Types.Math.Vector2Like) {
    const s = this.moteSrc[Math.floor(Math.random() * this.moteSrc.length)];
    if (!s) return;
    pt.x = s.x + (Math.random() - 0.5) * 22;
    pt.y = s.y + 4 + Math.random() * 30;
  }

  // ---------------------------------------------------------------------------------------

  /** Strongest warm light acting on a point (for rim light / cast shadows). */
  lightAt(x: number, y: number): LightHit | null {
    let best: LightHit | null = null;
    const dark = this.darkK;
    for (const g of this.glows) {
      const l = g.l;
      if (l.building !== this.here) continue;
      let power = 0;
      let reach = 0;
      let color = 0xffb060;
      switch (g.kind) {
        case 'lamp':
          power = dark;
          reach = 46;
          break;
        case 'fireOut':
          power = 0.4 + 0.6 * dark;
          reach = 56;
          color = 0xff9a48;
          break;
        case 'window':
          power = dark * 0.5;
          reach = 26;
          break;
        case 'hearth':
          power = 1;
          reach = 64;
          color = 0xffa048;
          break;
        case 'candle':
          power = 0.7;
          reach = 34;
          color = 0xffc070;
          break;
        default:
          continue;
      }
      if (power <= 0.02) continue;
      const lx = l.x;
      const ly = g.kind === 'lamp' ? l.y + 30 : l.y + 6; // lamps light the ground around their post
      const dx = lx - x;
      const dy = ly - (y - 10);
      const d = Math.hypot(dx, dy);
      if (d >= reach) continue;
      const k = power * (1 - d / reach) ** 1.5;
      if (!best || k > best.k) best = { k, dx, dy, color };
    }
    return best;
  }

  update(f: FxFrame) {
    const { t, view } = f;
    this.here = f.here;
    this.viewRect = view;
    // phase transitions ease over ~10 s; a door (inside <-> outside) snaps
    const snap = this.snapNext || this.lastInside === null || this.lastInside !== f.inside;
    this.snapNext = false;
    this.lastInside = f.inside;
    const still = (this.still = reducedMotion());
    const kd = snap ? 1 : 1 - Math.exp(-f.dt * 0.3);
    this.darkK += ((f.night ? 1 : f.dusk ? 0.7 : 0) - this.darkK) * kd;
    const dark = this.darkK;
    const light = 1 - dark;
    const m = 48;
    const inView = (x: number, y: number, r: number) => x + r > view.left - m && x - r < view.left + view.w + m && y + r > view.top - m && y - r < view.top + view.h + m;
    // comfy: slow, low-amplitude breathing, never a strobe
    const flick = (s: number) => (still ? 1 : 0.94 + 0.06 * Math.sin(t * 1.1 + s) * Math.sin(t * 0.43 + s * 1.7));

    // --- glows
    for (const g of this.glows) {
      const l = g.l;
      const vis = l.building === f.here && inView(l.x, l.y, 60);
      let a = 0;
      let ha = 0;
      if (vis) {
        const fl = flick(g.seed);
        switch (g.kind) {
          case 'lamp':
            a = 0.4 * dark * fl;
            ha = 0.1 * dark * fl;
            break;
          case 'fireOut':
            a = (0.09 + 0.19 * dark) * fl;
            ha = (0.05 + 0.1 * dark) * fl;
            break;
          case 'window':
            a = 0.12 * dark * fl;
            ha = 0.06 * dark;
            break;
          case 'holyWin':
            a = 0.2 * dark;
            ha = 0.07 * dark;
            break;
          case 'hearth':
            a = (0.16 + 0.06 * dark) * fl;
            ha = (0.08 + 0.04 * dark) * fl;
            break;
          case 'candle':
            a = (0.13 + 0.09 * dark) * fl;
            ha = (0.04 + 0.04 * dark) * fl;
            break;
          case 'coolIn':
            a = 0.16 * light + 0.07 * dark;
            if (g.core.tintTopLeft !== (dark > 0.5 ? 0x8a9ee0 : 0xfff0d0)) g.core.setTint(dark > 0.5 ? 0x8a9ee0 : 0xfff0d0);
            break;
          case 'holyIn':
            a = 0.15 * light + 0.07;
            ha = 0.05 * light + 0.03;
            break;
        }
      }
      if (g.kind === 'lamp' || g.kind === 'window') {
        const on = this.lampK(l);
        a *= on;
        ha *= on;
      }
      setGlow(g.core, a);
      if (g.halo) setGlow(g.halo, ha);
    }
    if (this.clockDisc && this.clockHalo && anchors.clock) {
      const c = anchors.clock;
      const vis = !f.inside && inView(c.x, c.y, 60);
      setGlow(this.clockDisc, 0);
      setGlow(this.clockHalo, vis ? 0.07 * dark * f.clockAlpha : 0);
    }
    this.updateBells(f);
    this.updateWeather(f, kd);

    // --- flames
    this.fireSrc.length = 0;
    for (const fl of this.flames) {
      const vis = fl.l.building === f.here && inView(fl.img.x, fl.img.y, 16);
      fl.img.setVisible(vis);
      if (!vis) continue;
      const fr = still ? 0 : Math.floor(t * (fl.hearth ? 5 : 3) + fl.seed) % fl.n;
      if (fl.cur !== fr) {
        fl.cur = fr;
        fl.img.setFrame(fr);
      }
      if (fl.hearth) {
        const w = fl.img.width;
        this.fireSrc.push({ x: fl.img.x + w / 2, y: fl.img.y - 4, w: w * 0.6 }, { x: fl.img.x + w / 2, y: fl.img.y - 5, w: w * 0.5 });
      } else if (hash(Math.round(fl.seed * 10), 3) < 0.5) this.fireSrc.push({ x: fl.img.x + 1.5, y: fl.img.y - 4, w: 1 });
    }
    const pm = still ? 0 : this.particleMul();
    setRate(this.fireEm, this.fireSrc.length * 1.5 * pm);

    // --- outdoor air embers / chimney sparks (dusk + night), interior sunbeam motes (day)
    this.airSrc.length = 0;
    if (!f.inside && dark > 0.05) {
      for (const s of anchors.smoke) if (inView(s.x, s.y, 0)) this.airSrc.push(s);
      for (const fl of this.flames) if (!fl.l.building && fl.img.visible) this.airSrc.push({ x: fl.img.x + fl.img.width / 2, y: fl.img.y - 6 });
    }
    setRate(this.airEm, f.inside ? 0 : 3.5 * dark * dark * pm);
    this.moteSrc.length = 0;
    if (f.inside && light > 0.3) for (const g of this.glows) if (g.kind === 'coolIn' && g.l.building === f.here) this.moteSrc.push(g.l);
    setRate(this.moteEm, this.moteSrc.length * 1.6 * light * pm);

    // --- haze
    const fogT = FOG[f.phase] ?? FOG.day!;
    const fogTarget = f.inside ? { c: dark > 0.5 ? 0x2a2438 : 0xe8d8c0, a: 0.05 } : fogT;
    this.fogK += (fogTarget.a + (f.inside ? 0 : 0.06 * this.rainK) - this.fogK) * kd;
    this.fogC = lerpColor(this.fogC, fogTarget.c, Math.min(1, kd * 1.5));
    const cam = this.scene.cameras.main;
    const zoom = cam.zoomX;
    const vw = cam.width / zoom;
    const vh = cam.height / cam.zoomY;
    const fx = (cam.width - vw) / 2 - 1;
    const fy = (cam.height - vh) / 2 - 1;
    const fogLayers = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1 : 0;
    const layer = (ts: Phaser.GameObjects.TileSprite, on: boolean, par: number, sx: number, sy: number, top: number, bottom: number) => {
      ts.setVisible(on);
      if (!on) return;
      const w = Math.ceil(vw) + 2;
      const h = Math.ceil(vh) + 2;
      if (ts.width !== w || ts.height !== h) ts.setSize(w, h);
      ts.setPosition(fx, fy);
      const tt = still ? 0 : t;
      ts.setTilePosition((view.left * par + tt * sx) / ts.tileScaleX, (view.top * par + tt * sy) / ts.tileScaleY);
      ts.setTint(this.fogC);
      const a = this.fogK;
      ts.setAlpha(a * top, a * top, a * bottom, a * bottom);
    };
    // restrained distant haze: strongest toward the top of the view (farther away), clear near the
    // bottom where the actor plane is; the second, finer layer only up top as well
    layer(this.fogA, fogLayers >= 1 && this.fogK > 0.005, 0.92, 3.2, 0.8, 0.85, 0.12);
    layer(this.fogB, fogLayers >= 2 && this.fogK > 0.005, 1.0, -5.5, -1.2, 0.35, 0.0);
    this.updateGroundFog(f, fogLayers >= 1, inView);

    // --- tree shadows (cast lower-right by day, short and faint at night) + leaves
    const sa = 0.42 * light + 0.18 * dark;
    const lv = this.leaves;
    lv.clear();
    for (const tr of this.trees) {
      const p = tr.p;
      const vis = !f.inside && inView(p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h));
      tr.shadow.setVisible(vis);
      if (!vis) continue;
      tr.shadow.setAlpha(sa);
      if (tr.leaves && dark < 0.85 && !still) this.drawLeaves(lv, tr.p, tr.leaves, t, 1 - dark);
    }

    // --- grade
    if (this.pipeline) {
      const base = GRADES[f.phase] ?? GRADES.day!;
      easeGrade(this.grade, f.inside ? interiorGrade(base, f.night) : base, kd);
      this.pipeline.grade = this.grade;
    }
  }

  /**
   * Ground-fog bands (2 broken bands per anchor, 4-8 % at night/dawn): along long garden-wall runs,
   * cemetery fence rows and where paths leave the town. Drawn at ground level under the actors and
   * BEFORE the multiply lighting, so mist only glows where a lamp actually lights it.
   */
  private makeGroundFog() {
    const TS = townLayout.tileSize;
    const anchors: { x: number; y: number; len: number }[] = [];
    const g = townMap.ground;
    const W = townLayout.townBounds.w;
    // horizontal wall runs (>= 6 tiles): mist pools along the foot of the wall
    for (let y = 0; y < g.length; y++) {
      let run = 0;
      for (let x = 0; x <= W; x++) {
        const c = x < W ? g[y]![x] : '';
        if (c === 'w') run++;
        else {
          if (run >= 6) anchors.push({ x: (x - run) * TS, y: (y + 1) * TS + 6, len: run * TS });
          run = 0;
        }
      }
    }
    // fence rows (cemetery ironwork)
    const rows = new Map<number, number[]>();
    for (const o of townMap.objects) if (o.kind.startsWith('iron')) rows.set(o.y, [...(rows.get(o.y) ?? []), o.x]);
    for (const [y, xs] of rows) {
      if (xs.length < 6) continue;
      xs.sort((p, q) => p - q);
      anchors.push({ x: xs[0]! * TS, y: (y + 1) * TS + 4, len: (xs[xs.length - 1]! - xs[0]! + 1) * TS });
    }
    // street ends: path tiles on the town edge
    const path = (c: string | undefined) => c === ':' || c === '=' || c === 'g';
    for (let x = 1; x < W - 1; x++) {
      if (path(g[1]?.[x]) && !path(g[1]?.[x - 1])) anchors.push({ x: x * TS - 24, y: 2 * TS, len: 96 });
      if (path(g[g.length - 2]?.[x]) && !path(g[g.length - 2]?.[x - 1])) anchors.push({ x: x * TS - 24, y: (g.length - 2) * TS, len: 96 });
    }
    const pick = anchors.slice(0, 18);
    pick.forEach((an, i) => {
      for (let k = 0; k < 2; k++) {
        const w = 56 + hash(i, k + 3) * 40;
        const img = this.scene.add
          .image(an.x, an.y, TX.glow)
          .setDisplaySize(w, 12 + hash(i, k + 5) * 8)
          .setDepth(3.9)
          .setTint(0xdce4f0)
          .setVisible(false);
        // 0.05-0.15 tile/s
        const speed = (0.05 + 0.1 * hash(i, k + 7)) * TS * (k % 2 ? -1 : 1);
        this.bands.push({ img, x0: an.x, len: Math.max(an.len, 64), y: an.y + (k ? 5 : 0), speed, phase: hash(i, k + 9), a: 0.04 + 0.04 * hash(i, k + 11) });
      }
    });
  }

  private updateGroundFog(f: FxFrame, on: boolean, inView: (x: number, y: number, r: number) => boolean) {
    // night and dawn: full; bedtime: half; day: a whisper
    const amount = f.inside || !on ? 0 : f.night || f.phase === 'dawn' ? 1 : f.phase === 'bedtime' ? 0.5 : 0.25;
    for (const b of this.bands) {
      const u = (b.phase + (this.still ? 0 : (f.t * b.speed) / b.len)) % 1;
      const x = b.x0 + ((u + 1) % 1) * b.len;
      const vis = amount > 0 && inView(x, b.y, 60);
      b.img.setVisible(vis);
      if (!vis) continue;
      // fade at both ends of the run so the patch never pops
      const edge = Math.min(1, Math.min((u + 1) % 1, 1 - ((u + 1) % 1)) * 6);
      // the multiply lighting dims it at night; compensate so the visible opacity stays ~4-8 %
      b.img.setPosition(x, b.y).setAlpha(b.a * amount * edge * (f.night ? 2.2 : 1));
    }
  }

  /** Public bell / toll cue: the belfry bells swing for a few seconds. */
  bell(durationMs = 4500) {
    this.bellUntil = performance.now() + durationMs;
  }

  /** Belfry bells: cut from the clock tower's (fading) upper part, swung while the bell rings. */
  setBellTower(t: Phaser.GameObjects.Image | null) {
    if (!t || this.bellTower) return;
    const fr = t.frame;
    const D = OBJ_DENSITY;
    const tex = t.texture;
    const bells = (anchors as unknown as { bells?: { x: number; y: number; w: number; h: number }[] }).bells ?? BELLS;
    bells.forEach((b, i) => {
      const key = `fx_bell_${i}`;
      if (!tex.has(key)) tex.add(key, 0, fr.cutX + b.x * D, fr.cutY + b.y * D, b.w * D, b.h * D);
      const depth = t.depth + 0.3;
      const cover = this.scene.add.rectangle(t.x + b.x + 1, t.y + b.y * UPRIGHT_Y, b.w - 2, b.h * UPRIGHT_Y, 0x141219).setOrigin(0, 0).setDepth(depth).setVisible(false);
      const bell = this.scene.add.image(t.x + b.x + b.w / 2, t.y + (b.y + 1) * UPRIGHT_Y, tex.key, key).setOrigin(0.5, 1 / b.h).setScale(1 / D, UPRIGHT_Y / D).setDepth(depth + 0.01).setVisible(false);
      this.bells.push({ cover, bell, seed: i * 1.9 });
    });
    this.bellTower = t;
  }
  private bellTower: Phaser.GameObjects.Image | null = null;

  private updateBells(f: FxFrame) {
    const left = this.bellUntil - performance.now();
    const on = left > 0 && !f.inside && !!this.bellTower;
    for (const b of this.bells) {
      b.cover.setVisible(on);
      b.bell.setVisible(on);
      if (!on) continue;
      const a = this.bellTower!.alpha;
      const decay = Math.min(1, left / 1500);
      const ang = this.still ? 0 : Math.sin(f.t * Math.PI * 2 * 0.85 + b.seed) * 0.42 * decay;
      b.bell.setRotation(ang).setAlpha(a);
      b.cover.setAlpha(a);
    }
  }

  /** Cloud shadows by day; a rare, gentle drizzle in deterministic wall-clock windows. */
  private updateWeather(f: FxFrame, kd: number) {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoomX;
    const vh = cam.height / cam.zoomY;
    const light = 1 - this.darkK;
    const cl = !f.inside && this.quality !== 'low' && light > 0.05;
    this.clouds.setVisible(cl);
    if (cl) {
      const w = Math.ceil(vw) + 2;
      const h = Math.ceil(vh) + 2;
      if (this.clouds.width !== w || this.clouds.height !== h) this.clouds.setSize(w, h);
      this.clouds.setPosition((cam.width - vw) / 2 - 1, (cam.height - vh) / 2 - 1);
      const ct = this.still ? 0 : f.t;
      this.clouds.setTilePosition((f.view.left + ct * 7) / this.clouds.tileScaleX, (f.view.top + ct * 2.5) / this.clouds.tileScaleY);
      this.clouds.setAlpha(0.16 * light * (1 - this.rainK * 0.5));
    }
    // drizzle: ~1 in 8 eight-minute windows, faded in/out over ~20 s
    const win = 480;
    const n = Math.floor(f.t / win);
    const ph = f.t / win - n;
    const raining = hash(n, 77) < 0.125 && f.phase !== 'waiting';
    const env = this.forceDrizzle ?? (raining ? Math.min(1, ph * 24, (1 - ph) * 24) : 0);
    this.rainK += (env - this.rainK) * Math.min(1, kd * 2);
    const rate = !f.inside && !this.still ? 55 * this.rainK * this.particleMul() : 0;
    setRate(this.rain, rate);
  }

  /** dev/review only: pin the drizzle strength (null = wall-clock schedule) */
  forceDrizzle: number | null = null;

  /** 0..1 drizzle strength (for haze). */
  get drizzle() {
    return this.rainK;
  }

  private drawLeaves(g: Phaser.GameObjects.Graphics, p: FxProp, pal: number[], t: number, vis: number) {
    const seed = p.x * 7 + p.y * 13;
    for (let k = 0; k < 3; k++) {
      const period = 5.5 + hash(seed, k) * 3.5;
      const cyc = t / period + hash(seed, k + 9);
      const n = Math.floor(cyc);
      const age = cyc - n;
      if (hash(n, seed + k) < 0.35) continue; // not every cycle drops a leaf
      const x0 = p.x + p.w * (0.2 + 0.6 * hash(n, seed + k + 1));
      const y0 = p.y + p.h * (0.2 + 0.3 * hash(n, seed + k + 2));
      const ground = p.y + p.h - 2 + hash(n, seed + k + 3) * 10;
      const x = Math.round(x0 + Math.sin(age * 7 + k * 2) * 3 + age * 10);
      const y = Math.round(y0 + (ground - y0) * age);
      const a = (age > 0.85 ? (1 - age) / 0.15 : 1) * vis;
      g.fillStyle(pal[(n + k) % pal.length]!, a);
      if (Math.floor(t * 5 + k + n) % 2 === 0) g.fillRect(x, y, 2, 1);
      else g.fillRect(x, y, 1, 2);
    }
  }
}

function glowKind(l: FxLight): GlowKind {
  if (l.building) {
    if (l.color === 'fire') return l.prop === 'fireplace' || (!l.prop && l.r >= 70) ? 'hearth' : 'candle';
    if (l.color === 'holy') return 'holyIn';
    if (l.color === 'cool') return 'coolIn';
    return 'candle';
  }
  if (l.facade) return l.color === 'holy' ? 'holyWin' : 'window';
  if (l.color === 'fire') return 'fireOut';
  return 'lamp';
}

function setGlow(img: Phaser.GameObjects.Image, a: number) {
  const on = a > 0.01;
  if (img.visible !== on) img.setVisible(on);
  if (on) img.setAlpha(Math.min(1, a));
}

function setRate(em: Phaser.GameObjects.Particles.ParticleEmitter, perSec: number) {
  if (perSec < 0.05) {
    if (em.emitting) em.stop();
    return;
  }
  em.frequency = 1000 / perSec;
  if (!em.emitting) em.start();
}

/** Leaf colours for autumn-coloured tree frames (null for green trees). */
function autumnPalette(scene: Phaser.Scene, frame: string): number[] | null {
  try {
    const fr = scene.textures.getFrame('objects', frame);
    if (!fr) return null;
    const src = fr.source.image as HTMLImageElement | HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = fr.cutWidth;
    c.height = fr.cutHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
    const d = ctx.getImageData(0, 0, c.width, Math.round(c.height * 0.65)).data;
    let r = 0;
    let g = 0;
    let n = 0;
    const counts = new Map<number, number>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 200) continue;
      r += d[i]!;
      g += d[i + 1]!;
      n++;
      if (d[i]! > d[i + 1]! * 1.15 && d[i]! > 90) {
        const col = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
        counts.set(col, (counts.get(col) ?? 0) + 1);
      }
    }
    if (!n || r < g * 1.05) return null;
    const pal = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
    return pal.length ? pal : null;
  } catch {
    return null;
  }
}
