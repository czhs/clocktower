// CMU easter eggs (client side) — OWNED BY cmu-eggs. TownScene calls mountEggs(scene, ctx) once,
// after the town map, objects and ambient layer exist; the returned function cleans up.
//
// Rules (docs/art-direction.md, docs/world-audit.md, docs/easter-eggs.md):
//  - purely local visuals and examine cards: no server messages, no game state;
//  - everything depends only on public map data, the wall clock, the PUBLIC phase and our own
//    position (to know which egg we stand next to) — never on other entities, the Storyteller or
//    visits, so nothing can leak night information or give an advantage;
//  - creatures never collide and keep off doorsteps; outdoor eggs hide while we are indoors.
import * as Phaser from 'phaser';
import { GHOST_STYLES, tileCenterPx, type TownLayout } from '@ct/protocol';
import type { TownMap } from '@ct/assets';
import type { localPlayer } from '../../net/localPlayer';
import eggManifest from '@ct/assets/generated/eggs/manifest.json';
import objectsAtlas from '@ct/assets/generated/objects.json';
import { CHAR } from '../sprites';
import * as W from '../../../../../packages/assets/src/eggs/world';
import { EggUi, type CardSpec } from './card';
import * as T from './content';

export interface EggContext {
  layout: TownLayout;
  townMap: TownMap;
  /** Our own predicted position/location (store: get() / subscribe(fn) -> unsubscribe). */
  localPlayer: typeof localPlayer;
  /** Public game phase ('waiting' before a game). */
  phase(): string;
  /** Subscribe to public phase changes; returns an unsubscribe function. */
  onPhase(cb: (phase: string) => void): () => void;
  /** Show a short message/card to this player only (DOM caption, ~4 s). */
  showPopup(content: string | { title: string; body: string }): void;
  /** Depth for a y-sorted sprite whose feet/bottom edge is at world y (same rule as map objects). */
  depthFor(bottomY: number): number;
  /** Fixed layers: flat ground decals, objects (use depthFor), air (above roofs), lighting overlay. */
  layers: { ground: number; air: number; lighting: number };
  /** Texture key of the objects atlas (frames from objects.json, incl. EGG_SPRITES). */
  objectsTexture: string;
}

const TS = 16;
/** Art density of the atlases (docs/art-direction.md 2x contract): texels per world px. */
const OBJ_D = (objectsAtlas as unknown as { density?: number }).density ?? 1;
const CHAR_D = (CHAR as unknown as { density?: number }).density ?? 1;
const DOOR_KEEP_OUT = 24; // the door prompt wins within this distance of a door
const PROMPT: Record<W.EggId, string> = {
  fence: 'Read the Fence',
  lift: 'Call the lift',
  workshop: 'Look inside',
  engine: 'Lift the hatch',
  shelf: 'Browse the shelf',
  notice: 'Read the notices',
  crypt: 'Read the plaque',
};
const LANTERN_DAY = [0xb37072, 0x729395, 0xd5b56a, 0x8eb4c2, 0x806184];
const LANTERN_NIGHT = [0xf0b85f, 0xd98043, 0xb37072, 0x806184, 0x8eb4c2, 0x91a46a, 0xcce1de];

interface Creature {
  img: Phaser.GameObjects.Image;
  copies: Phaser.GameObjects.Image[];
}

export function mountEggs(scene: Phaser.Scene, ctx: EggContext): () => void {
  const eggs = new Eggs(scene, ctx);
  return () => eggs.destroy();
}

class Eggs {
  private ui: EggUi;
  private offs: (() => void)[] = [];
  private atlas: Phaser.Textures.Texture;
  private has = (f: string) => this.atlas.has(f);
  private timeOffset = 0;
  private fixedTime: number | null = null;
  private forceDark: boolean | null = null;
  private cost = { n: 0, sum: 0, max: 0 };
  // state
  private open: { id: W.EggId; page: number } | null = null;
  private near: W.EggHotspot | null = null;
  private seq: Record<'lift' | 'workshop' | 'shelf', number> = { lift: 0, workshop: 0, shelf: 0 };
  private engineLog: string[] = [];
  private fenceStamp: number;
  // visuals
  private fenceOverlay: Phaser.GameObjects.Image | null = null;
  private fenceAt: { x: number; y: number; bottom: number } | null = null;
  private camp: Phaser.GameObjects.Image | null = null;
  private walkers: { def: W.WandererDef; route: W.Route; c: Creature; phase: number }[] = [];
  private requin: Phaser.GameObjects.Image | null = null;
  private frogs: Phaser.GameObjects.Image[] = [];
  private polly: Phaser.GameObjects.Image | null = null;
  private chonk: Phaser.GameObjects.Image | null = null;
  private opal: Phaser.GameObjects.Image | null = null;
  private opalPath: { x: number; y: number }[] = [];
  private cilantro: Phaser.GameObjects.Image | null = null;
  private fox: Phaser.GameObjects.Image | null = null;
  private panda: Phaser.GameObjects.Image | null = null;
  private greenting: Phaser.GameObjects.Image | null = null;
  private tomb!: Phaser.GameObjects.Graphics;
  private ghosts: { img: Phaser.GameObjects.Image; row: number; style: string; k: number }[] = [];
  private lanterns: { x: number; y: number }[] = [];
  private lanternG: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics] | null = null;
  private glows: Phaser.GameObjects.Image[] = [];
  /** wide, faint washes of the lantern colours on the water and the deck */
  private washes: Phaser.GameObjects.Image[] = [];
  private wisp: Phaser.GameObjects.Graphics;
  private sparks: Phaser.GameObjects.Graphics;
  private grin: Phaser.GameObjects.Image | null = null;
  /** night glows on lit windows / lanterns / the hatch: [image, kind] */
  private nightGlows: { img: Phaser.GameObjects.Image; base: number; kind: 'window' | 'hatch' | 'spark' }[] = [];
  private workshopTL: { x: number; y: number } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private ctx: EggContext,
  ) {
    this.atlas = scene.textures.get(ctx.objectsTexture);
    this.ui = new EggUi(scene.game.canvas.parentElement ?? document.body);
    this.fenceStamp = W.fenceStampForDay(Date.now());

    this.setupFence();
    this.setupCreatures();
    this.setupGhosts();
    this.setupBridge();
    this.wisp = scene.add.graphics().setDepth(ctx.layers.lighting + 2);
    this.sparks = scene.add.graphics().setDepth(ctx.layers.lighting + 2);
    this.setupGlows();

    // a new coat of paint every night: the public dawn transition repaints the Fence
    this.offs.push(
      ctx.onPhase((p) => {
        if (p === 'dawn' || p === 'day') this.fenceStamp = W.fenceStampForDawn(Date.now());
      }),
    );
    const onUpdate = () => {
      const t0 = performance.now();
      this.update();
      const dt = performance.now() - t0;
      this.cost.n++;
      this.cost.sum += dt;
      this.cost.max = Math.max(this.cost.max, dt);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.offs.push(() => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));

    const key = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', key);
    this.offs.push(() => window.removeEventListener('keydown', key));

    try {
      if (localStorage.getItem('ctEggsDebug') === '1') this.exposeDebug();
    } catch {
      /* storage blocked: no debug hook */
    }
  }

  destroy() {
    for (const off of this.offs.splice(0)) off();
    this.ui.destroy();
  }

  // ------------------------------------------------------------------------------- clock / phase

  private now() {
    return this.fixedTime ?? Date.now() / 1000 + this.timeOffset;
  }
  private dark() {
    if (this.forceDark !== null) return this.forceDark;
    return W.eggDark(this.ctx.phase(), new Date((this.now()) * 1000).getHours());
  }

  // ------------------------------------------------------------------------------- setup

  private obj(kind: string) {
    return this.ctx.townMap.objects.find((o) => o.kind === kind);
  }

  private image(frame: string, depth: number): Phaser.GameObjects.Image | null {
    if (!this.has(frame)) return null; // atlas not regenerated yet: skip quietly
    return this.scene.add.image(0, 0, this.ctx.objectsTexture, frame).setOrigin(0.5, 1).setScale(1 / OBJ_D).setDepth(depth).setVisible(false);
  }

  private setupFence() {
    const o = this.obj('egg_fence');
    if (!o) return;
    const bottom = (o.y + 1) * TS;
    this.fenceAt = { x: o.x * TS, y: bottom - 32, bottom };
    if (this.has('egg_fence_1'))
      this.fenceOverlay = this.scene.add
        .image(o.x * TS, bottom - 32, this.ctx.objectsTexture, 'egg_fence_1')
        .setOrigin(0, 0)
        .setScale(1 / OBJ_D)
        .setDepth(this.ctx.depthFor(bottom) + 0.01)
        .setVisible(false);
    // the overnight guards' tent, just east of the Fence
    this.camp = this.image('egg_camp', this.ctx.depthFor(bottom + 14));
    this.camp?.setPosition(o.x * TS + 4 * TS + 18, bottom + 14);
  }

  private setupCreatures() {
    const L = this.ctx.layout;
    for (const def of W.WANDERERS) {
      if (![...def.frames.walk, def.frames.rest].every(this.has)) continue;
      const route = W.planLoop(L, def.waypoints);
      const mk = () => this.scene.add.image(0, 0, this.ctx.objectsTexture, def.frames.rest).setOrigin(0.5, 1).setScale(1 / OBJ_D).setVisible(false);
      const c: Creature = { img: mk(), copies: (def.copies ?? []).map(mk) };
      this.walkers.push({ def, route, c, phase: def.id.length * 97 });
    }
    if (this.has('egg_requin_0')) this.requin = this.image('egg_requin_0', this.ctx.layers.ground + 0.5);
    if (this.has('egg_requin_grin')) this.grin = this.image('egg_requin_grin', this.ctx.layers.ground + 0.6);
    if (this.has('egg_frog_green_0') && this.has('egg_frog_blue_0'))
      this.frogs = ['green', 'blue'].map((c) => this.image(`egg_frog_${c}_0`, 0)!).filter(Boolean);
    if (this.has('egg_polly_0_0')) this.polly = this.image('egg_polly_0_0', 0);
    if (this.has('egg_chonk')) this.chonk = this.image('egg_chonk', this.ctx.depthFor(W.CHONK.y));
    this.chonk?.setPosition(W.CHONK.x, W.CHONK.y);
    this.opalPath = W.riverPath(this.ctx.townMap.ground);
    if (this.has('egg_opal_0') && this.opalPath.length > 1) this.opal = this.image('egg_opal_0', this.ctx.layers.ground + 0.5);
    if (this.has('egg_cilantro_0')) this.cilantro = this.image('egg_cilantro_0', this.ctx.depthFor(W.CILANTRO.y))?.setPosition(W.CILANTRO.x, W.CILANTRO.y) ?? null;
    const MM = W.MINCUT_MAXFLOW;
    if (this.has('egg_fox_0')) this.fox = this.image('egg_fox_0', this.ctx.depthFor(MM.fox.y))?.setPosition(MM.fox.x, MM.fox.y) ?? null;
    if (this.has('egg_panda_0')) this.panda = this.image('egg_panda_0', this.ctx.depthFor(MM.panda.y))?.setPosition(MM.panda.x, MM.panda.y).setFlipX(true) ?? null;
    const well = this.obj('well');
    if (this.has('egg_greenting_0')) this.greenting = this.image('egg_greenting_0', well ? this.ctx.depthFor((well.y + 1) * TS) + 0.5 : this.ctx.depthFor(W.GREENTING.y));
    this.tomb = this.scene.add.graphics().setDepth(this.ctx.layers.air);
  }

  /** Lit window panes, lantern cores, the hatch's screen and the broken instrument take part in the lighting. */
  private setupGlows() {
    if (!this.scene.textures.exists('lights')) return;
    const frames = (eggManifest as unknown as { frames: Record<string, { glows?: [number, number][]; h: number }> }).frames;
    const add = (x: number, y: number, r: number, tint: number, base: number, kind: 'window' | 'hatch' | 'spark') => {
      const img = this.scene.add
        .image(x, y, 'lights', 1)
        .setDepth(this.ctx.layers.lighting + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((r * 2) / 128)
        .setTint(tint)
        .setVisible(false);
      this.nightGlows.push({ img, base, kind });
    };
    for (const kind of ['egg_wean', 'egg_hamerschlag']) {
      const o = this.obj(kind);
      const f = frames[kind];
      if (!o || !f) continue;
      const left = o.x * TS;
      const top = (o.y + 1) * TS - f.h;
      if (kind === 'egg_hamerschlag') this.workshopTL = { x: left, y: top };
      for (const [gx, gy] of f.glows ?? []) add(left + gx, top + gy, 9, 0xf0b85f, 0.5, 'window');
    }
    const camp = frames.egg_camp;
    if (this.camp && camp) for (const [gx, gy] of camp.glows ?? []) add(this.camp.x - 16 + gx, this.camp.y - 24 + gy, 12, 0xf0b85f, 0.7, 'window');
    const hatch = this.obj('egg_hatch');
    if (hatch) add(hatch.x * TS + 8, hatch.y * TS + 13, 14, 0x5adf8a, 0.55, 'hatch');
    if (this.workshopTL) add(this.workshopTL.x + W.WORKSHOP_SPARK.dx, this.workshopTL.y + W.WORKSHOP_SPARK.dy, 16, 0xcce1de, 0, 'spark');
  }

  private setupGhosts() {
    const tex = this.scene.textures.get('chars');
    if (!tex || tex.key === '__MISSING') return;
    W.GHOST_QUEUE.forEach((g, i) => {
      const style = GHOST_STYLES[i % GHOST_STYLES.length]!;
      const sheet = CHAR.sheets[`ghost/${style}`];
      if (!sheet) return;
      const row = CHAR.directions.indexOf(g.facing);
      for (let c = 0; c < CHAR.frames.length; c++) {
        const name = `egg-ghost-${style}-${row}-${c}`;
        if (!tex.has(name)) tex.add(name, 0, sheet.x + c * CHAR.frameWidth, sheet.y + row * CHAR.frameHeight, CHAR.frameWidth, CHAR.frameHeight);
      }
      const img = this.scene.add
        .image(g.x, g.y, 'chars', `egg-ghost-${style}-${row}-0`)
        .setOrigin(CHAR.anchor.x / CHAR.frameWidth, CHAR.anchor.y / CHAR.frameHeight)
        .setDepth(this.ctx.depthFor(g.y))
        .setAlpha(0.85)
        .setScale(1 / CHAR_D)
        .setVisible(false);
      this.ghosts.push({ img, row, style, k: i });
    });
  }

  private setupBridge() {
    this.lanterns = W.bridgeLanterns(this.ctx.layout, this.ctx.townMap.ground);
    if (!this.lanterns.length) return;
    const top = this.lanterns.filter((l, i) => i % 2 === 0);
    this.lanternG = [
      this.scene.add.graphics().setDepth(this.ctx.depthFor(top[0]!.y + 2)),
      this.scene.add.graphics().setDepth(this.ctx.depthFor(this.lanterns[1]!.y + 2)),
    ];
    if (this.scene.textures.exists('lights'))
      this.glows = this.lanterns.map((l) =>
        this.scene.add.image(l.x, l.y - 2, 'lights', 1).setDepth(this.ctx.layers.lighting + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(26 / 128).setVisible(false),
      );
    if (this.scene.textures.exists('lights'))
      this.washes = this.lanterns
        .filter((_, i) => i % 4 === 0)
        .map((l) => this.scene.add.image(l.x + 4, l.y + 8, 'lights', 1).setDepth(this.ctx.layers.lighting + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(72 / 128).setVisible(false));
  }

  // ------------------------------------------------------------------------------- per frame

  private update() {
    const t = this.now();
    const me = this.ctx.localPlayer.get();
    const out = me.location === 'outdoors';
    const dark = this.dark();
    const cam = this.scene.cameras.main.worldView;
    const inView = (x: number, y: number, m = 48) => x > cam.x - m && x < cam.right + m && y > cam.y - m && y < cam.bottom + m;

    // the Fence: tonight's paint, and the guards' tent after dark
    const paint = W.fencePaint(this.fenceStamp, T.FENCE_MESSAGES.length);
    if (this.fenceOverlay) {
      const v = paint.variant;
      if (v > 0 && this.has(`egg_fence_${v}`)) this.fenceOverlay.setFrame(`egg_fence_${v}`).setVisible(out);
      else this.fenceOverlay.setVisible(false);
    }
    this.camp?.setVisible(out && dark);

    // wandering creatures (day only: they sleep after the bell)
    this.tomb.clear();
    for (const w of this.walkers) {
      const show = out && (W.NIGHT_WANDERERS.has(w.def.id) ? dark : !dark);
      const p = W.poseAt(w.route, t, w.def.speed, w.def.walk, w.def.rest, w.phase);
      const visible = show && inView(p.x, p.y);
      const frame = p.moving ? w.def.frames.walk[Math.floor(t * 6) % w.def.frames.walk.length]! : w.def.id === 'honk' ? (((t + w.phase) % (w.def.walk + w.def.rest)) - w.def.walk < 0.7 ? w.def.frames.rest : w.def.frames.walk[0]!) : w.def.frames.rest;
      const all = [{ img: w.c.img, dx: 0, dy: 0 }, ...w.c.copies.map((img, i) => ({ img, ...w.def.copies![i]! }))];
      for (const a of all) {
        a.img.setVisible(visible);
        if (!visible) continue;
        const x = Math.round(p.x + a.dx);
        const y = Math.round(p.y + a.dy);
        a.img.setPosition(x, y).setFlipX(p.left).setDepth(this.ctx.depthFor(y));
        if (a.img.frame.name !== frame) a.img.setFrame(frame);
      }
      // Theo Rem ends every stop with a tiny end-of-proof tombstone
      if (visible && w.def.id === 'theo' && !p.moving) {
        const x = Math.round(p.x) + 3;
        const y = Math.round(p.y) - 17;
        this.tomb.fillStyle(0x191c29, 1).fillRect(x - 1, y - 1, 5, 6);
        this.tomb.fillStyle(0xded2b7, 1).fillRect(x, y, 3, 4);
      }
    }

    // Requin's fin circles the millpond (sharks do not sleep)
    if (this.requin) {
      const p = W.requinAt(t);
      const v = out && inView(p.x, p.y);
      this.requin.setVisible(v);
      if (v) this.requin.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.left).setFrame(`egg_requin_${Math.floor(t * 3) % 2}`);
    }
    // Progress (green) and Preservation (blue), two hops apart, forever
    this.frogs.forEach((img, i) => {
      const p = W.frogAt(t, i * 2);
      const v = out && !dark && inView(p.x, p.y);
      img.setVisible(v);
      if (!v) return;
      const f = `egg_frog_${i === 0 ? 'green' : 'blue'}_${p.hopping ? 1 : 0}`;
      img.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.left).setDepth(this.ctx.depthFor(p.y + (p.hopping ? 4 : 0)));
      if (img.frame.name !== f) img.setFrame(f);
    });
    // Polly: polymorphic plumage, perched on lamps, now and then flies to the next one
    if (this.polly) {
      const p = W.pollyAt(t);
      const v = out && !dark && inView(p.x, p.y, 80);
      this.polly.setVisible(v);
      if (v) {
        const f = `egg_polly_${p.variant}_${p.flying ? Math.floor(t * 8) % 2 : (t % 9 < 0.5 ? 1 : 0)}`;
        this.polly.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.left).setDepth(this.ctx.depthFor(p.y + 60));
        if (this.has(f) && this.polly.frame.name !== f) this.polly.setFrame(f);
      }
    }
    // Opal floats down the river and back (out of sight under the bridges)
    if (this.opal) {
      const p = W.opalAt(this.opalPath, t);
      const under = this.ctx.townMap.ground[Math.floor(p.y / TS)]?.[Math.floor(p.x / TS)] === 'b';
      const v = out && !dark && !under && inView(p.x, p.y);
      this.opal.setVisible(v);
      if (v) this.opal.setPosition(Math.round(p.x), Math.round(p.y) + 4).setFlipX(p.left).setFrame(`egg_opal_${Math.floor(t * 1.5) % 2}`);
    }
    // Cilantro outside the south gate (blinks), Mincut and Maxflow by the river (twitch, stand up)
    if (this.cilantro) {
      const v = out && !dark && inView(this.cilantro.x, this.cilantro.y - 40, 64);
      this.cilantro.setVisible(v);
      if (v) this.cilantro.setFrame(`egg_cilantro_${t % 4.3 < 0.18 ? 1 : 0}`);
    }
    if (this.fox) {
      const v = out && !dark && inView(this.fox.x, this.fox.y);
      this.fox.setVisible(v);
      if (v) this.fox.setFrame(`egg_fox_${t % 5.1 < 0.35 ? 1 : 0}`);
    }
    if (this.panda) {
      const v = out && !dark && inView(this.panda.x, this.panda.y);
      this.panda.setVisible(v);
      if (v) this.panda.setFrame(`egg_panda_${t % 7.3 < 1.6 ? 1 : 0}`);
    }
    // Greenting pops up out of the well now and then
    if (this.greenting) {
      const rise = W.greentingRise(t);
      const v = out && rise > 0.02 && inView(W.GREENTING.x, W.GREENTING.y);
      this.greenting.setVisible(v);
      if (v) {
        this.greenting.setFrame(`egg_greenting_${t % 1.2 < 0.6 ? 0 : 1}`);
        const H = this.greenting.frame.height; // texels
        const vis = Math.max(1, Math.round(H * rise));
        this.greenting.setPosition(W.GREENTING.x, W.GREENTING.y + (H - vis) / OBJ_D).setCrop(0, 0, this.greenting.frame.width, vis);
      }
    }

    // Chonk, very occasionally
    this.chonk?.setVisible(out && !dark && W.chonkVisible(t) && inView(W.CHONK.x, W.CHONK.y));

    // office-hours queue at the crypt (night only)
    for (const g of this.ghosts) {
      const v = out && dark && inView(g.img.x, g.img.y);
      g.img.setVisible(v);
      if (v) g.img.setFrame(`egg-ghost-${g.style}-${g.row}-${Math.floor(t * 5 + g.k * 1.7) % CHAR.frames.length}`);
    }

    // Requin surfaces now and then, all teeth
    if (this.grin && this.requin) {
      const g = W.requinGrinning(t) && this.requin.visible;
      this.grin.setVisible(g);
      if (g) {
        this.grin.setPosition(this.requin.x, this.requin.y + 2).setFlipX(this.requin.flipX);
        this.requin.setVisible(false);
      }
    }

    // lit windows, lanterns, the hatch's green screen, sparks from the broken instrument
    const sb = W.sparkBurst(t);
    for (const g of this.nightGlows) {
      const vis = out && inView(g.img.x, g.img.y, 32);
      let a = 0;
      if (g.kind === 'window') a = dark ? g.base * (0.9 + 0.1 * Math.sin(t * 1.3 + g.img.x)) : 0;
      else if (g.kind === 'hatch') a = (dark ? g.base : g.base * 0.35) * (0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3));
      else if (g.kind === 'spark') a = sb.on && sb.age < 1 ? (1 - sb.age) * (dark ? 0.9 : 0.5) : 0;
      g.img.setVisible(vis && a > 0.01).setAlpha(a);
    }
    this.drawSparks(t, out, sb, inView);

    this.drawBridge(t, out, dark, inView);
    this.drawWisp(t, out, dark, inView);
    this.updateHotspot(me, out);
  }

  private drawBridge(t: number, out: boolean, dark: boolean, inView: (x: number, y: number, m?: number) => boolean) {
    if (!this.lanternG) return;
    const [gt, gb] = this.lanternG;
    gt.clear();
    gb.clear();
    const vis = out && inView(this.lanterns[0]!.x, this.lanterns[0]!.y, 120);
    this.glows.forEach((g) => g.setVisible(false));
    this.washes.forEach((g) => g.setVisible(false));
    if (!vis) return;
    if (dark)
      this.washes.forEach((w, j) => w.setVisible(true).setTint(LANTERN_NIGHT[(j * 2 + Math.floor(t * 1.5)) % LANTERN_NIGHT.length]!).setAlpha(0.22));
    this.lanterns.forEach((l, i) => {
      const g = i % 2 === 0 ? gt : gb;
      const k = i >> 1;
      // after dark the colours travel across the span, slowly, like the real bridge's lights
      const col = dark ? LANTERN_NIGHT[(k + Math.floor(t * 1.5) + (i % 2) * 3) % LANTERN_NIGHT.length]! : LANTERN_DAY[k % LANTERN_DAY.length]!;
      g.fillStyle(0x191c29, 1).fillRect(Math.round(l.x), Math.round(l.y) - 1, 1, 3);
      g.fillStyle(col, 1).fillRect(Math.round(l.x) - 1, Math.round(l.y) - 3, 3, 2);
      if (dark && this.glows[i]) this.glows[i]!.setVisible(true).setTint(col).setAlpha(0.55 + 0.15 * Math.sin(t * 2 + k));
    });
  }

  /** The broken instrument behind the Workshop's dark window spits sparks every few seconds. */
  private drawSparks(t: number, out: boolean, sb: { on: boolean; age: number; seed: number }, inView: (x: number, y: number, m?: number) => boolean) {
    const g = this.sparks;
    g.clear();
    if (!out || !this.workshopTL || !sb.on || sb.age >= 1) return;
    const x0 = this.workshopTL.x + W.WORKSHOP_SPARK.dx;
    const y0 = this.workshopTL.y + W.WORKSHOP_SPARK.dy;
    if (!inView(x0, y0, 40)) return;
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI / 2 + (W.eggHash(sb.seed, k) - 0.5) * 2.4;
      const sp = 10 + W.eggHash(sb.seed, k + 9) * 14;
      const x = Math.round(x0 + Math.cos(ang) * sp * sb.age);
      const y = Math.round(y0 + Math.sin(ang) * sp * sb.age + 18 * sb.age * sb.age);
      g.fillStyle(k % 2 ? 0xffe2a0 : 0xcce1de, 1 - sb.age).fillRect(x, y, 1, 1);
    }
  }

  /** Walking to the sky: after dark, every half minute a little figure steps off the top. */
  private drawWisp(t: number, out: boolean, dark: boolean, inView: (x: number, y: number, m?: number) => boolean) {
    const g = this.wisp;
    g.clear();
    if (!out || !dark || !inView(W.SKY_TIP.x, W.SKY_TIP.y, 60)) return;
    const age = (t % 30) / 5; // 5 s of every 30
    if (age > 1) return;
    const x = Math.round(W.SKY_TIP.x + age * 6);
    const y = Math.round(W.SKY_TIP.y - age * 36);
    const a = 1 - age;
    g.fillStyle(0xcce1de, 0.9 * a).fillRect(x, y, 1, 1).fillRect(x - 1, y + 1, 3, 2);
    g.fillStyle(0x8eb4c2, 0.6 * a).fillRect(x - 1, y + 3, 1, 1).fillRect(x + 1, y + 3, 1, 1);
  }

  // ------------------------------------------------------------------------------- interaction

  private nearDoor(me: { x: number; y: number; location: string }) {
    const L = this.ctx.layout;
    for (const b of L.buildings) {
      const inside = me.location === `bld:${b.id}`;
      if (!inside && me.location !== 'outdoors') continue;
      const c = tileCenterPx(L, inside ? b.interiorDoor : b.door);
      if (Math.hypot(c.x - me.x, c.y - me.y) <= DOOR_KEEP_OUT) return true;
    }
    return false;
  }

  private hotspotFor(me: { x: number; y: number; location: string }): W.EggHotspot | null {
    if (this.nearDoor(me)) return null;
    let best: W.EggHotspot | null = null;
    let bd = Infinity;
    for (const h of W.EGG_HOTSPOTS) {
      if (h.location !== me.location) continue;
      const d = Math.hypot(h.x - me.x, h.y - me.y);
      if (d <= h.r && d < bd) [best, bd] = [h, d];
    }
    return best;
  }

  private updateHotspot(me: { x: number; y: number; location: string }, _out: boolean) {
    const h = this.hotspotFor(me);
    if (this.open) {
      const cur = W.EGG_HOTSPOTS.find((x) => x.id === this.open!.id)!;
      if (cur.location !== me.location || Math.hypot(cur.x - me.x, cur.y - me.y) > cur.r + 28) this.close();
    }
    this.near = h;
    this.ui.setPrompt(h && !this.open ? PROMPT[h.id] : null, h ? () => this.activate() : null);
  }

  private onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
    if (e.code === 'Escape' && this.open) return void this.close();
    if (e.code !== 'KeyE' && e.code !== 'Space') return;
    if (this.open) return void this.activate();
    if (this.near) this.activate();
  }

  private close() {
    this.open = null;
    this.ui.close();
  }

  /** E / tap: open the nearest egg, or advance the open one. */
  private activate() {
    const id = this.open?.id ?? this.near?.id;
    if (!id) return;
    const reopening = !!this.open;
    const spec = this.card(id, reopening);
    if (!spec) return this.close();
    this.open = { id, page: 0 };
    this.ui.show(spec, () => this.close());
  }

  private card(id: W.EggId, advance: boolean): CardSpec | null {
    const seqCard = (k: 'lift' | 'workshop' | 'shelf', pages: readonly T.Page[], style: CardSpec['style']): CardSpec => {
      if (advance) this.seq[k] = (this.seq[k] + 1) % pages.length;
      else if (k !== 'shelf') this.seq[k] = 0; // the lift and the workshop start over; the shelf remembers
      const p = pages[this.seq[k]]!;
      return { style, title: p.title, lines: p.lines, foot: p.foot ?? 'E — continue' };
    };
    if (advance && !['lift', 'workshop', 'shelf', 'engine'].includes(id)) return null; // E again closes a plaque
    switch (id) {
      case 'fence': {
        const p = W.fencePaint(this.fenceStamp, T.FENCE_MESSAGES.length);
        const lines = [`Layer ${p.layer.toLocaleString('en-US')} of paint. Repainted overnight, every night, with brushes — as is proper.`];
        if (this.dark()) lines.push('Two villagers keep watch from a tartan tent, wrapped in blankets and principle.');
        return { style: 'parchment', title: 'The Fence', banner: T.FENCE_MESSAGES[p.message], lines, foot: 'The posts are mostly paint by now.' };
      }
      case 'lift':
        return seqCard('lift', T.LIFT, 'stone');
      case 'workshop':
        return seqCard('workshop', T.WORKSHOP, 'parchment');
      case 'shelf':
        return seqCard('shelf', T.BOOKS, 'parchment');
      case 'notice': {
        const day = W.fenceStampForDay(this.now() * 1000);
        const picks = new Set<number>();
        for (let k = 0; picks.size < 3 && k < 40; k++) picks.add(Math.floor(W.eggHash(day, k) * T.NOTICES.length));
        return { style: 'notice', title: 'Village notices', lines: [...picks].map((i) => T.NOTICES[i]!) };
      }
      case 'crypt': {
        const p = this.dark() ? T.CRYPT_NIGHT : T.CRYPT_DAY;
        return { style: 'stone', title: p.title, lines: p.lines };
      }
      case 'engine': {
        if (!advance || !this.engineLog.length) this.engineLog = [...T.ENGINE_BANNER, '$ _'];
        else return null; // E with the terminal open closes the hatch
        return this.engineCard();
      }
    }
  }

  private engineCard(): CardSpec {
    return {
      style: 'terminal',
      title: T.ENGINE_INTRO,
      lines: this.engineLog,
      commands: T.ENGINE_COMMANDS.map((c) => ({
        label: c.cmd,
        run: () => {
          this.engineLog = [...this.engineLog.slice(0, -1), `$ ${c.cmd}`, ...c.out, '$ _'].slice(-40);
          this.ui.show(this.engineCard(), () => this.close());
        },
      })),
      foot: 'E or × — close the hatch',
    };
  }

  // ------------------------------------------------------------------------------- debug (opt-in)

  /** Only with localStorage.ctEggsDebug = '1': local visual time travel for screenshots/tests. */
  private exposeDebug() {
    const api = {
      hotspots: W.EGG_HOTSPOTS,
      setTimeOffset: (s: number) => void (this.timeOffset = s),
      /** freeze the egg clock at wall-clock second t (null: live) */
      setFixedTime: (t: number | null) => void (this.fixedTime = t),
      me: () => this.ctx.localPlayer.get(),
      /** cost of the egg update per frame (ms), since the last reset */
      stats: (reset = false) => {
        const r = { frames: this.cost.n, avgMs: this.cost.n ? this.cost.sum / this.cost.n : 0, maxMs: this.cost.max };
        if (reset) this.cost = { n: 0, sum: 0, max: 0 };
        return r;
      },
      setDark: (v: boolean | null) => void (this.forceDark = v),
      repaint: (stamp: number) => void (this.fenceStamp = stamp),
      state: () => ({ open: this.open?.id ?? null, near: this.near?.id ?? null, dark: this.dark(), t: this.now(), phase: this.ctx.phase() }),
      visible: () => ({
        walkers: this.walkers.map((w) => ({ id: w.def.id, visible: w.c.img.visible, x: w.c.img.x, y: w.c.img.y })),
        requin: this.requin?.visible ?? null,
        frogs: this.frogs.map((f) => f.visible),
        polly: this.polly?.visible ?? null,
        chonk: this.chonk?.visible ?? null,
        opal: this.opal?.visible ?? null,
        cilantro: this.cilantro?.visible ?? null,
        fox: this.fox?.visible ?? null,
        panda: this.panda?.visible ?? null,
        greenting: this.greenting?.visible ?? null,
        ghosts: this.ghosts.filter((g) => g.img.visible).length,
        camp: this.camp?.visible ?? null,
        fenceOverlay: this.fenceOverlay?.visible ? this.fenceOverlay.frame.name : null,
        glows: this.glows.filter((g) => g.visible).length,
        nightGlows: this.nightGlows.filter((g) => g.img.visible).map((g) => g.kind),
        grin: this.grin?.visible ?? null,
      }),
    };
    (window as unknown as { __ctEggs?: typeof api }).__ctEggs = api;
    this.offs.push(() => delete (window as unknown as { __ctEggs?: typeof api }).__ctEggs);
  }
}
