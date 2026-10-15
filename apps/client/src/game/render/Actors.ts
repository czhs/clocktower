// Actors: layered character sprites (density aware), name labels (overlay camera), contact shadows,
// warm/moonlight rims and the idle bounce. Label layout runs in screen space each frame.
//
// Privacy: TownScene only creates/positions avatars for entities the server sent us, and only
// shows (sprite, label, shadow, rim, carried light) those in our own location.
import * as Phaser from 'phaser';
import { presetById } from '@ct/assets';
import type { Facing, LocationId } from '@ct/protocol';
import type { LightHit } from '../fx/FxLayer';
import { TX } from '../fx/textures';
import { CHAR, hasPreset, type SpriteKind } from '../sprites';
import { CHAR_DENSITY, CHAR_WORLD } from './density';
import { GROUND_Y, UPRIGHT_Y } from './projection';

type Dir = Facing;

// Name labels (guide "Characters and labels"): constant screen size, compact ink backing,
// screen-space collision resolution. Sizes in CSS px.
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const LABEL_MAX = 14;
const LABEL_GAP = 4;
const LABEL_STEPS = 2;
/** world px from feet to the top of the head */
const LABEL_HEAD = Math.max(20, CHAR_WORLD.anchorY - 2);
const PARCHMENT = '#e4d8ba';
const FOCUS_GOLD = '#d5b56a';
const labelText = (name: string, st: boolean) => {
  const n = name.length > LABEL_MAX ? name.slice(0, LABEL_MAX - 1) + '…' : name;
  return st && !/storyteller/i.test(name) ? `${n} · Storyteller` : n;
};
// Expressive idle: gentle squash/stretch while standing (feet stay anchored: origin is the feet).
const IDLE_HZ = 1.2;
const IDLE_SQUASH = 0.04;
const BASE = 1 / CHAR_DENSITY;
const lerpRGB = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export interface ActorHost {
  scene: Phaser.Scene;
  ensureCharacterTexture(kind: SpriteKind): string;
  toOverlay(o: Phaser.GameObjects.GameObject): void;
  labelRes(): number;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  facing: Dir;
  moving: boolean;
}

export class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  /** soft contact shadow, short cast shadow, warm 1-texel edge toward a nearby light */
  shadow: Phaser.GameObjects.Image;
  cast: Phaser.GameObjects.Image;
  rim: Phaser.GameObjects.Sprite;
  /** additive self-copy that lessens ambient darkening at night (see fx) */
  boost: Phaser.GameObjects.Sprite;
  ghost = false;
  private seed: number;
  key = '';
  facing: Dir = 'down';
  moving = false;
  location: LocationId = 'outdoors';
  samples: Sample[] = [];
  hasLantern = false;
  isST = false;
  /** label layout state (screen px lift, alpha) */
  labelLift = 0;
  labelK = 0;
  constructor(
    readonly host: ActorHost,
    readonly pid: string,
    x: number,
    y: number,
  ) {
    const scene = host.scene;
    const ox = CHAR.anchor.x / CHAR.frameWidth;
    const oy = CHAR.anchor.y / CHAR.frameHeight;
    this.sprite = scene.add.sprite(x, y, '__DEFAULT').setOrigin(ox, oy).setScale(BASE, BASE * UPRIGHT_Y);
    // Drawn at 1/zoom world scale so it is always 14 CSS px; placed by layoutLabels.
    this.label = scene.add
      .text(x, y, '', {
        fontFamily: LABEL_FONT,
        fontSize: '14px',
        fontStyle: '600',
        color: PARCHMENT,
        backgroundColor: 'rgba(33,31,44,0.9)',
        padding: { left: 5, right: 5, top: 1, bottom: 2 },
        resolution: host.labelRes(),
      })
      .setOrigin(0, 0)
      .setDepth(5200)
      .setAlpha(0);
    host.toOverlay(this.label);
    let h = 0;
    for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
    this.seed = ((h >>> 0) % 628) / 100;
    this.shadow = scene.add.image(x, y, TX.shadow).setDepth(2.5).setDisplaySize(18, 7).setAlpha(0.42);
    this.cast = scene.add.image(x, y, TX.shadow).setDepth(2.45).setVisible(false);
    this.rim = scene.add.sprite(x, y, '__DEFAULT').setOrigin(ox, oy).setScale(BASE).setVisible(false);
    this.boost = scene.add.sprite(x, y, '__DEFAULT').setOrigin(ox, oy).setScale(BASE).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  setAppearance(kind: SpriteKind, name: string) {
    const key = this.host.ensureCharacterTexture(kind);
    this.isST = kind.kind === 'storyteller';
    this.ghost = kind.kind === 'player' && kind.ghost;
    this.hasLantern = kind.kind === 'player' && !kind.ghost && (hasPreset(kind.cosmetics.preset) ? !!presetById(kind.cosmetics.preset)?.lantern : kind.cosmetics.accessory === 'lantern');
    const text = labelText(name, this.isST);
    if (this.label.text !== text) this.label.setText(text);
    const col = this.isST ? FOCUS_GOLD : PARCHMENT;
    if (this.label.style.color !== col) this.label.setColor(col);
    if (key !== this.key) {
      this.key = key;
      this.sprite.setTexture(key, 0);
      this.play(true);
    }
  }
  setPose(x: number, y: number, facing: Dir, moving: boolean) {
    // snap to the texel grid (1/density world px) so 2x art moves in single texels
    this.sprite.setPosition(Math.round(x * CHAR_DENSITY) / CHAR_DENSITY, Math.round(y * CHAR_DENSITY) / CHAR_DENSITY);
    this.sprite.setDepth(10 + y);
    if (facing !== this.facing || moving !== this.moving) {
      this.facing = facing;
      this.moving = moving;
      this.play();
    }
  }
  play(force = false) {
    if (!this.key) return;
    const anim = `${this.key}#${this.moving ? 'walk' : 'idle'}-${this.facing}`;
    if (force || this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim, !force);
  }
  setVisible(v: boolean) {
    if (this.sprite.visible === v) return;
    this.sprite.setVisible(v);
    this.label.setVisible(v);
    this.shadow.setVisible(v && !this.ghost);
    if (!v) {
      this.rim.setVisible(false);
      this.boost.setVisible(false);
      this.cast.setVisible(false);
    }
    this.labelK = 0;
    this.label.setAlpha(0);
    if (v) this.play(true);
  }

  /**
   * Per-frame FX for a VISIBLE avatar:
   *  - idle bounce (not with reduced motion; ghosts keep their own float)
   *  - contact shadow + a softer, short cast shadow pointing away from a strong nearby light
   *  - warm response near warm lights (tint + restrained 1-texel warm edge on the lit side)
   *  - night identity: actors darken ~18 % less than scenery under the ambient. A copy of the
   *    sprite is ADDed on top of itself BEFORE the multiply lighting, so the actor keeps the same
   *    cool hue and the same local lamp response, just less of the ambient darkening (no outline).
   * `hit` comes from public map lights only.
   */
  fx(t: number, hit: LightHit | null, rimOn: boolean, dark: number, still: boolean) {
    const s = this.sprite;
    if (!s.visible) return;
    if (!this.moving && !this.ghost && !still) {
      const b = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 * IDLE_HZ + this.seed);
      s.setScale(BASE * (1 + IDLE_SQUASH * 0.4 * b), BASE * UPRIGHT_Y * (1 - IDLE_SQUASH * b));
    } else if (s.scaleX !== BASE || s.scaleY !== BASE * UPRIGHT_Y) s.setScale(BASE, BASE * UPRIGHT_Y);
    const sync = (o: Phaser.GameObjects.Sprite, dx: number, dy: number, dd: number) => {
      if (o.texture !== s.texture || o.frame.name !== s.frame.name) o.setTexture(s.texture.key, s.frame.name);
      o.setPosition(s.x + dx, s.y + dy).setScale(s.scaleX, s.scaleY).setDepth(s.depth + dd).setFlipX(s.flipX);
    };
    const k = hit ? Math.min(1, hit.k * 1.4) : 0;
    // --- shadows
    const sh = this.shadow;
    const cast = this.cast;
    if (this.ghost) {
      if (sh.visible) sh.setVisible(false);
      if (cast.visible) cast.setVisible(false);
    } else {
      sh.setVisible(true).setPosition(s.x + 1, s.y + 0.5).setDisplaySize(16, 6).setAlpha(0.55 - 0.1 * dark);
      if (hit && k > 0.08) {
        const d = Math.hypot(hit.dx, hit.dy) || 1;
        const ux = -hit.dx / d;
        const uy = -hit.dy / d;
        const len = 10 + 8 * k;
        cast
          .setVisible(true)
          .setPosition(s.x + ux * len * 0.45, s.y + uy * len * 0.2 + 1)
          .setDisplaySize(len + 8, 6)
          .setRotation(Math.atan2(uy * 0.45, ux))
          .setAlpha(0.28 * k);
      } else if (cast.visible) cast.setVisible(false);
    }
    // --- night identity boost (outdoors at night ~ +18 % of the ambient-lit colour)
    const boostA = this.ghost ? 0 : 0.22 * dark * (1 - Math.min(1, hit ? hit.k : 0));
    if (boostA > 0.01) {
      sync(this.boost, 0, 0, 0.005);
      this.boost.setAlpha(boostA).setVisible(true);
    } else if (this.boost.visible) this.boost.setVisible(false);
    // --- warm response near warm lights: tint + a restrained edge on the lit side
    const rim = this.rim;
    const px = 1 / CHAR_DENSITY; // one TEXEL
    if (rimOn && hit && hit.k > 0.08 && !this.ghost) {
      const d = Math.hypot(hit.dx, hit.dy) || 1;
      const sx = Math.abs(hit.dx) / d > 0.38 ? Math.sign(hit.dx) : 0;
      const sy = Math.abs(hit.dy) / d > 0.38 ? Math.sign(hit.dy) : 0;
      sync(rim, sx * px, sy * px, -0.01);
      rim.setTintFill(hit.color).setAlpha(Math.min(0.45, hit.k * 0.9)).setVisible(true);
      s.setTint(lerpRGB(0xffffff, 0xffe0bc, Math.min(1, hit.k * 1.2)));
    } else {
      if (rim.visible) rim.setVisible(false);
      if (s.isTinted) s.clearTint();
    }
  }
  destroy() {
    this.sprite.destroy();
    this.label.destroy();
    this.shadow.destroy();
    this.cast.destroy();
    this.rim.destroy();
    this.boost.destroy();
  }
}

/** Build the per-appearance animations for a freshly composed sheet texture. */
export function createCharacterAnims(scene: Phaser.Scene, key: string, ghost: boolean) {
  const cols = CHAR.frames.length;
  CHAR.directions.forEach((dir, r) => {
    scene.anims.create({
      key: `${key}#walk-${dir}`,
      frames: [1, 2, 3, 4].map((c) => ({ key, frame: r * cols + c })),
      frameRate: CHAR.walkFps,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}#idle-${dir}`,
      frames: (ghost ? [0, 1, 2, 3, 4] : [0]).map((c) => ({ key, frame: r * cols + c })),
      frameRate: ghost ? 5 : 1,
      repeat: -1,
    });
  });
}

/**
 * Name labels: constant ~14 CSS px, placed in screen space each frame. Priority: you, then the
 * Storyteller, then others by distance to you. A label that would overlap an already placed one
 * moves up in small steps (at most LABEL_STEPS), otherwise it is hidden until space frees up.
 */
export class LabelLayout {
  private boxes: { x: number; y: number; w: number; h: number }[] = [];
  private order: { a: Avatar; x: number; y: number; p: number }[] = [];

  layout(me: Avatar | null, others: Iterable<Avatar>, view: { left: number; top: number }, zoom: number, screen: { w: number; h: number }, dt: number, covered: (x: number, y: number) => boolean = () => false) {
    const L0 = Math.round(view.left * zoom) / zoom;
    const zy = zoom * GROUND_Y;
    const T0 = Math.round(view.top * zy) / zy;
    const list = this.order;
    list.length = 0;
    const mx = me?.sprite.x ?? 0;
    const my = me?.sprite.y ?? 0;
    if (me && me.sprite.visible) list.push({ a: me, x: me.sprite.x, y: me.sprite.y, p: -2 });
    for (const a of others) {
      if (!a.sprite.visible) continue;
      const x = a.sprite.x;
      const y = a.sprite.y;
      list.push({ a, x, y, p: a.isST ? -1 : Math.hypot(x - mx, y - my) });
    }
    list.sort((u, v) => u.p - v.p);
    const placed = this.boxes;
    placed.length = 0;
    const kA = 1 - Math.exp(-dt * 14);
    const kL = 1 - Math.exp(-dt * 18);
    const free = (x: number, y: number, w: number, h: number) => {
      for (const r of placed) if (x < r.x + r.w + LABEL_GAP && x + w + LABEL_GAP > r.x && y < r.y + r.h + LABEL_GAP && y + h + LABEL_GAP > r.y) return false;
      return true;
    };
    for (const { a, x, y } of list) {
      const t = a.label;
      const w = t.width;
      const h = t.height;
      const sx = Math.round((x - L0) * zoom - w / 2);
      const sy = Math.round((y - LABEL_HEAD * UPRIGHT_Y - T0) * zy - 6 - h);
      let lift = -1;
      // no label floating over masonry for a body hidden behind an opaque base
      if (!covered(x, y) && sx + w > 0 && sx < screen.w && sy + h > 0 && sy - LABEL_STEPS * h < screen.h) {
        const step = Math.ceil((h + LABEL_GAP) / 2);
        for (let s = 0; s <= LABEL_STEPS; s++)
          if (free(sx, sy - s * step, w, h)) {
            lift = s * step;
            break;
          }
      }
      if (lift >= 0) {
        placed.push({ x: sx, y: sy - lift, w, h });
        a.labelLift = a.labelK < 0.05 ? lift : a.labelLift + (lift - a.labelLift) * kL;
      }
      const target = lift >= 0 ? 1 : 0;
      a.labelK = Math.abs(a.labelK - target) < 0.02 ? target : a.labelK + (target - a.labelK) * kA;
      t.setAlpha(a.labelK);
      t.setScale(1 / zoom, 1 / zy);
      t.setPosition(L0 + sx / zoom, T0 + Math.round(sy - a.labelLift) / zy);
    }
  }
}
