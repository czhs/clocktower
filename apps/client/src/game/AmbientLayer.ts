// Ambient life for the town (purely visual, non-colliding). Driven by TownScene.
//
// Privacy rule: everything here is a deterministic function of the wall clock, the public phase
// and public map data — identical for every viewer. The only entity-driven effects (footstep
// dust, door swings) are fed by TownScene exclusively for avatars that are visible to us (same
// location), so nothing reveals where anyone else (e.g. the Storyteller at night) is.
//
// Performance: two Graphics objects redrawn per frame (~100-300 tiny rects), a handful of
// images, and a few additive light stamps; work is culled to the camera view.
import * as Phaser from 'phaser';
import { AMBIENT, townLayout } from '@ct/assets';
import { anchors } from './render/anchors';
import { UPRIGHT_Y } from './render/projection';
import type { BuildingDef } from '@ct/protocol';
import { OBJ_DENSITY } from './render/density';

const TS = townLayout.tileSize;
type Stamp = (x: number, y: number, r: number, color: number, alpha: number, soft?: number) => void;

export interface AmbientFrame {
  /** seconds (wall clock, shared by all viewers) */
  t: number;
  dt: number;
  phase: string;
  night: boolean;
  dusk: boolean;
  inside: boolean;
  /** building id we are in, or null outdoors */
  here: string | null;
  view: { left: number; top: number; w: number; h: number };
  stamp: Stamp;
  /** public phase progress 0..1 (null if unknown) */
  progress: number | null;
}

/** Shared ambient clock (wall time, seconds) so every viewer sees the same ambient motion. */
export const ambientTime = () => (Date.now() / 1000) % 100000;

const hash = (a: number, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Dust {
  x: number;
  y: number;
  t0: number;
  vx: number;
}
interface DoorAnim {
  g: Phaser.GameObjects.Graphics;
  t0: number;
}

export class AmbientLayer {
  private ground: Phaser.GameObjects.Graphics;
  private air: Phaser.GameObjects.Graphics;
  private clock: Phaser.GameObjects.Graphics | null = null;
  private critters: { img: Phaser.GameObjects.Image; kind: string; period: number; seed: number }[] = [];
  private fog: Phaser.GameObjects.Image[] = [];
  private vignette: Phaser.GameObjects.Image;
  private dust: Dust[] = [];
  private dustAt = new Map<string, number>();
  private doors: DoorAnim[] = [];
  private bellUntil = 0;
  private clockKey = '';
  private fogK = 0;
  private vigK = 0;
  /** cheap fog blobs + image vignette: only when the FX layer runs at low quality (fx/FxLayer) */
  private fallback = true;

  constructor(
    private scene: Phaser.Scene,
    /** Fireplace lights inside buildings (embers). */
    private fires: { x: number; y: number; building: string | null }[],
  ) {
    this.ground = scene.add.graphics().setDepth(3);
    this.air = scene.add.graphics().setDepth(4000);
    AMBIENT.critters.forEach((c, i) => {
      const frame = `critter_${c.kind}_0`;
      const img = scene.add.image(c.x, c.y, 'objects', frame).setOrigin(0, 1).setScale(1 / OBJ_DENSITY).setDepth(10 + c.y).setFlipX(!!c.flip);
      this.critters.push({ img, kind: c.kind, period: c.period, seed: i * 1.7 });
    });
    if (anchors.clock) this.clock = scene.add.graphics().setDepth(10 + clockDepthY() + 0.5);
    for (let i = 0; i < AMBIENT.fog.count; i++)
      this.fog.push(scene.add.image(0, 0, 'lights', 1).setDepth(4001).setTint(0x8a90a8).setAlpha(0).setBlendMode(Phaser.BlendModes.SCREEN));
    // night vignette (screen space)
    const key = 'ct-vignette';
    if (!scene.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
      g.addColorStop(0, 'rgba(6,8,20,0)');
      g.addColorStop(1, 'rgba(6,8,20,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      scene.textures.addCanvas(key, c);
    }
    this.vignette = scene.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(0).setDepth(5100).setAlpha(0);
  }

  /** FX quality 'low': use these cheap fog blobs and the image vignette instead of the post pass. */
  setFallback(on: boolean) {
    this.fallback = on;
  }

  /** Follow the clock tower's upper-part occlusion fade (TownScene.fadeOccluders). */
  setClockAlpha(a: number) {
    this.clock?.setAlpha(a);
  }

  /** Public bell/toll cue: the belfry glows while the bells swing. */
  bell(durationMs = 4500) {
    this.bellUntil = performance.now() + durationMs;
  }

  /** A visible avatar took a step (TownScene only calls this for avatars in our location). */
  footstep(id: string, x: number, y: number, t: number) {
    const last = this.dustAt.get(id) ?? 0;
    if (t - last < 0.3) return;
    this.dustAt.set(id, t);
    if (this.dust.length > 60) this.dust.shift();
    this.dust.push({ x: x + (hash(Math.round(t * 100), 7) - 0.5) * 4, y: y - 1, t0: t, vx: (hash(Math.round(t * 100), 9) - 0.5) * 6 });
  }

  /** A visible avatar went through an outdoor door (we saw it vanish/appear there). */
  doorSwing(b: BuildingDef, t: number) {
    const w = b.kind === 'tavern' ? 16 : b.kind === 'chapel' ? 20 : b.kind === 'clocktower' ? 16 : 12;
    const h = b.kind === 'chapel' ? 30 : b.kind === 'clocktower' ? 26 : b.kind === 'tavern' ? 24 : 20;
    const bottom = (b.footprint.y + b.footprint.h) * TS;
    const cx = b.door.x * TS + 8;
    const g = this.scene.add.graphics().setDepth(10 + bottom + 0.4);
    g.fillStyle(0x07050b, 1).fillRect(Math.round(cx - w / 2) + 1, bottom - h + 1, w - 2, h - 2);
    g.fillStyle(0x3a2a1e, 1).fillRect(Math.round(cx - w / 2) + 1, bottom - h + 1, 2, h - 2); // door leaf seen edge-on
    this.doors.push({ g, t0: t });
  }

  update(f: AmbientFrame) {
    const { t, view } = f;
    const out = !f.inside;
    const inView = (x: number, y: number, m = 32) => x > view.left - m && x < view.left + view.w + m && y > view.top - m && y < view.top + view.h + m;
    const g = this.ground;
    const a = this.air;
    g.clear();
    a.clear();
    const dark = f.night || f.dusk;

    // --- critters (outdoors only; the town quiets down at night: they are asleep)
    for (const c of this.critters) {
      c.img.setVisible(out && !f.night && inView(c.img.x, c.img.y));
      if (!c.img.visible) continue;
      const ph = (t + c.seed) % c.period;
      const alt = c.kind === 'crow' ? ph < 0.5 && Math.floor((t + c.seed) / c.period) % 3 === 0 : ph < (c.kind === 'dog' ? 0.6 : 0.9);
      const frame = `critter_${c.kind}_${alt ? 1 : 0}`;
      if (c.img.frame.name !== frame) c.img.setFrame(frame);
    }

    if (out) {
      // --- chimney smoke
      const smokeCol = dark ? 0x4e4a5c : 0x8a8496;
      for (let i = 0; i < anchors.smoke.length; i++) {
        const s = anchors.smoke[i]!;
        if (!inView(s.x, s.y, 48)) continue;
        for (let k = 0; k < 6; k++) {
          const age = (t * 0.22 + k / 6 + hash(i, 3)) % 1;
          const x = s.x + Math.sin(age * 4 + i) * 2 + age * 10;
          const y = s.y - 2 - age * 30;
          const r = Math.round(1 + age * 3.5);
          blob(a, x, y, r, smokeCol, (1 - age) * (dark ? 0.45 : 0.32));
        }
      }
      // --- pond rings (fish rising)
      const P = AMBIENT.pond;
      if (inView(P.cx, P.cy, P.rx + 16))
        for (let k = 0; k < 3; k++) {
          const cyc = t / 3.4 + k / 3;
          const n = Math.floor(cyc);
          const age = cyc - n;
          const ang = hash(n, k + 11) * Math.PI * 2;
          const rr = Math.sqrt(hash(n, k + 13));
          const x = P.cx + Math.cos(ang) * P.rx * 0.8 * rr;
          const y = P.cy + Math.sin(ang) * P.ry * 0.8 * rr;
          ring(g, x, y, 1 + age * 6, 0.5 + age * 2.6, 0xa8c4dc, (1 - age) * 0.55);
        }
      // --- water sparkles
      const vis = AMBIENT.water.filter((w) => inView(w.x * TS + 8, w.y * TS + 8, 8));
      if (vis.length)
        for (let k = 0; k < Math.min(26, Math.ceil(vis.length / 6)); k++) {
          const cyc = t / 1.6 + k * 0.37;
          const n = Math.floor(cyc);
          const age = cyc - n;
          const w = vis[Math.floor(hash(n, k) * vis.length)]!;
          const x = w.x * TS + Math.floor(hash(n, k + 1) * 16);
          const y = w.y * TS + Math.floor(hash(n, k + 2) * 16);
          const al = Math.sin(age * Math.PI) * (dark ? 0.55 : 0.75);
          g.fillStyle(0xbcd6ee, al).fillRect(x, y, 1, 1);
          if (age > 0.35 && age < 0.65) g.fillStyle(0xbcd6ee, al * 0.5).fillRect(x - 1, y, 3, 1);
        }
      // --- fireflies (dusk/night)
      if (dark)
        AMBIENT.fireflies.forEach((ff, ai) => {
          for (let k = 0; k < ff.count; k++) {
            const s1 = hash(ai * 50 + k, 1);
            const s2 = hash(ai * 50 + k, 2);
            const x = ff.area.x + (0.5 + 0.45 * Math.sin(t * (0.21 + s1 * 0.2) + s2 * 9)) * ff.area.w;
            const y = ff.area.y + (0.5 + 0.45 * Math.sin(t * (0.17 + s2 * 0.2) + s1 * 7)) * ff.area.h;
            if (!inView(x, y)) continue;
            const blink = Math.pow(Math.max(0, Math.sin(t * (1.3 + s1) + s2 * 20)), 3);
            if (blink < 0.05) continue;
            a.fillStyle(0xe0f48a, blink).fillRect(Math.round(x), Math.round(y), 1, 1);
            f.stamp(x, y, 9, 0xc8f070, blink * 0.7, 1);
          }
        });
      // --- bats around the spire (dusk/night)
      if (dark) {
        const B = AMBIENT.bats;
        if (inView(B.cx, B.cy, B.rx + 20))
          for (let k = 0; k < B.count; k++) {
            const ang = t * (0.8 + k * 0.09) + k * 1.3;
            const x = Math.round(B.cx + Math.cos(ang) * B.rx * (0.75 + 0.25 * Math.sin(k)));
            const y = Math.round(B.cy + Math.sin(ang) * B.ry + Math.sin(t * 3 + k) * 4);
            const up = Math.floor(t * 11 + k) % 2 === 0;
            a.fillStyle(0x0a0810, 1);
            a.fillRect(x - 1, y, 2, 1);
            if (up) a.fillRect(x - 3, y - 1, 2, 1).fillRect(x + 1, y - 1, 2, 1);
            else a.fillRect(x - 3, y + 1, 2, 1).fillRect(x + 1, y + 1, 2, 1).fillRect(x - 2, y, 1, 1).fillRect(x + 1, y, 1, 1);
          }
      }
    }

    // --- fog banks (night, outdoors) — eased in/out
    this.fogK += ((this.fallback && out && (f.night || f.phase === 'dawn') ? 1 : 0) - this.fogK) * Math.min(1, f.dt * 0.6);
    const F = AMBIENT.fog;
    this.fog.forEach((img, k) => {
      if (this.fogK < 0.01) return void img.setVisible(false);
      const x = F.area.x + ((hash(k, 21) * F.area.w + t * (4 + hash(k, 22) * 5)) % (F.area.w + 300)) - 150;
      const y = F.area.y + hash(k, 23) * F.area.h + Math.sin(t * 0.05 + k) * 20;
      img.setVisible(inView(x, y, 200)).setPosition(x, y).setScale(2.6 + hash(k, 24) * 2, 1.1 + hash(k, 25)).setAlpha(this.fogK * 0.16);
    });

    // --- interior embers rising from fires in the room we are in
    if (f.here)
      for (const l of this.fires) {
        if (l.building !== f.here) continue;
        for (let k = 0; k < 5; k++) {
          const age = (t * 0.7 + k / 5 + hash(Math.round(l.x), k)) % 1;
          const x = l.x + Math.sin(age * 6 + k) * 3;
          const y = l.y - age * 14;
          a.fillStyle(age < 0.5 ? 0xffc060 : 0xff7a30, (1 - age) * 0.9).fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }

    // --- footstep dust
    this.dust = this.dust.filter((d) => t - d.t0 < 0.45);
    for (const d of this.dust) {
      const age = (t - d.t0) / 0.45;
      blob(g, d.x + d.vx * age, d.y - age * 3, age < 0.5 ? 1 : 2, f.inside ? 0x6a5a4a : 0x8a7a64, (1 - age) * 0.5);
    }

    // --- door swings
    this.doors = this.doors.filter((d) => {
      const age = t - d.t0;
      if (age > 0.7) {
        d.g.destroy();
        return false;
      }
      d.g.setAlpha(age < 0.5 ? 1 : 1 - (age - 0.5) / 0.2);
      return true;
    });

    // --- live clock hands (public phase time)
    if (this.clock && anchors.clock) this.drawClock(f);

    // --- belfry glow while the bells swing (public cue)
    if (out && anchors.clock && performance.now() < this.bellUntil) {
      const k = (this.bellUntil - performance.now()) / 4500;
      const swing = 0.6 + 0.4 * Math.abs(Math.sin(t * 6));
      for (const ox of [-14, 14]) f.stamp(anchors.clock.x + ox, anchors.clock.y - 58, 26, 0xffcf7a, k * swing, 1);
    }

    // --- vignette (night, cinematic)
    this.vigK += ((!this.fallback ? 0 : f.night ? 1 : f.dusk ? 0.45 : 0) - this.vigK) * Math.min(1, f.dt * 0.8);
    const cam = this.scene.cameras.main;
    // gentle: the night ambient already carries the mood; keep the edges readable
    // (scroll-factor-0 objects are still zoomed about the camera centre: size it to the view)
    const vw = cam.width / cam.zoomX;
    const vh = cam.height / cam.zoomY;
    this.vignette.setDisplaySize(vw + 2, vh + 2).setPosition((cam.width - vw) / 2 - 1, (cam.height - vh) / 2 - 1).setAlpha(this.vigK * 0.5).setVisible(this.vigK > 0.01);
  }

  private drawClock(f: AmbientFrame) {
    const c = anchors.clock!;
    const [hh, mm] = gameTime(f.phase, f.progress);
    const key = `${hh}:${mm}`;
    if (key === this.clockKey) return;
    this.clockKey = key;
    const g = this.clock!;
    g.clear();
    const hand = (ang: number, len: number, w: number) => {
      for (let i = 0; i <= len; i++) {
        const x = Math.round(c.x + Math.sin(ang) * i);
        const y = Math.round(c.y - Math.cos(ang) * i * UPRIGHT_Y);
        g.fillStyle(0x120e16, 1).fillRect(x, y, w, w);
      }
    };
    hand(((hh % 12) + mm / 60) * (Math.PI / 6), Math.round(c.r * 0.42), 1);
    hand(mm * (Math.PI / 30), Math.round(c.r * 0.66), 1);
    g.fillStyle(0xe0c060, 1).fillRect(c.x, c.y, 1, 1);
  }

  setClockOffset(p: { x: number; y: number }) { this.clock?.setPosition(p.x, p.y); }
}

/** Town clock: maps the public phase (and its public progress) to an hour of the village day. */
export function gameTime(phase: string, progress: number | null): [number, number] {
  const span: Record<string, [number, number]> = {
    setup: [7, 8],
    day: [8, 18],
    bedtime: [18, 21],
    first_night: [21, 29],
    night: [21, 29],
    dawn: [29, 31],
    finished: [12, 12],
  };
  const s = span[phase];
  if (!s) {
    const d = new Date(); // lobby: the real local time
    return [d.getHours(), d.getMinutes()];
  }
  const p = progress === null ? 0.5 : Math.max(0, Math.min(1, progress));
  const hours = s[0] + (s[1] - s[0]) * p;
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60 / 5) * 5; // the hand jumps in 5-minute steps
  return [h, m];
}

function clockDepthY(): number {
  const ct = townLayout.buildings.find((b) => b.kind === 'clocktower');
  return ct ? (ct.footprint.y + ct.footprint.h) * TS : 0;
}

/** Rounded pixel blob. */
function blob(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number) {
  if (alpha <= 0.01) return;
  x = Math.round(x);
  y = Math.round(y);
  g.fillStyle(color, alpha);
  if (r <= 1) return void g.fillRect(x, y, 1, 1);
  g.fillRect(x - r + 1, y - r, 2 * r - 2, 2 * r);
  g.fillRect(x - r, y - r + 1, 1, 2 * r - 2);
  g.fillRect(x + r - 1, y - r + 1, 1, 2 * r - 2);
}

/** Pixel ellipse outline. */
function ring(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, color: number, alpha: number) {
  if (alpha <= 0.01) return;
  g.fillStyle(color, alpha);
  const n = Math.max(8, Math.round(rx * 5));
  let lx = NaN;
  let ly = NaN;
  for (let i = 0; i < n; i++) {
    const x = Math.round(cx + Math.cos((i / n) * Math.PI * 2) * rx);
    const y = Math.round(cy + Math.sin((i / n) * Math.PI * 2) * ry);
    if (x === lx && y === ly) continue;
    g.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}
