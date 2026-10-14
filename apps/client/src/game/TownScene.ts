// OWNED BY world-art. The Phaser town: tilemap + y-sorted objects, layered avatars, client
// prediction against the shared collision helpers, server reconciliation, interpolation of
// remote entities, door prompts, day/night lighting and the night isolation overlay.
import * as Phaser from 'phaser';
import { townLayout } from '@ct/assets';
import objectsAtlas from '@ct/assets/generated/objects.json';
import terrainUrl from '@ct/assets/generated/terrain.png';
import decorUrl from '@ct/assets/generated/decor.png';
import objectsUrl from '@ct/assets/generated/objects.png';
import lightsUrl from '@ct/assets/generated/lights.png';
import townJsonUrl from '@ct/assets/generated/town.json?url';
import {
  isBlockedPx,
  locationAt,
  PLAYER_SPEED,
  STORYTELLER_MAX_SPEED_MULT,
  tileCenterPx,
  type BuildingDef,
  type Cosmetics,
  type Facing,
  type GamePhase,
  type LobbyRoomView,
  type LocationId,
  type PlayerGameView,
  type StorytellerGameView,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import { localPlayer, remoteEntities } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { playCue, type Cue } from './audio';
import { appearanceKey, CHAR, CHARACTERS_URL, composeSheet, layerKeys, type SpriteKind } from './sprites';

const L = townLayout;
const TS = L.tileSize;
const MOVE_HZ = 15;
const INTERP_DELAY_MS = 110;
const DOOR_RANGE = 20; // a little tighter than the server's 22 px
const LOCKED: ReadonlySet<string> = new Set(['first_night', 'night', 'dawn']);
const NIGHT: ReadonlySet<string> = new Set(['first_night', 'night']);

type Phase = GamePhase | 'waiting';
type Dir = Facing;

export interface TownBridge {
  conn: RoomConnection;
  setPrompt(p: { key: string; text: string; locked?: boolean } | null): void;
  setCaption(c: string | null): void;
}

const AMBIENT_OUT: Record<Phase, number> = {
  waiting: 0xd0c8dc,
  setup: 0xc4b8d2,
  day: 0xe4dfec,
  bedtime: 0x9a7c98,
  first_night: 0x262c52,
  night: 0x262c52,
  dawn: 0xc59eac,
  finished: 0xe4dfec,
};
const AMBIENT_IN: Record<Phase, number> = {
  waiting: 0xcabba8,
  setup: 0xc0b0a0,
  day: 0xd0c2b0,
  bedtime: 0x8c7488,
  first_night: 0x4a3e60,
  night: 0x4a3e60,
  dawn: 0x9c8494,
  finished: 0xd0c2b0,
};
const LIGHT_TINT: Record<string, number> = { warm: 0xffb868, cool: 0x8a9ad0, fire: 0xff9440, holy: 0xc89aff, lantern: 0xffc070, st: 0xffcf7a };

interface LightSrc {
  x: number;
  y: number;
  r: number;
  color: string;
  building: string | null;
  facade: boolean;
}

interface Sample {
  t: number;
  x: number;
  y: number;
  facing: Dir;
  moving: boolean;
}

class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  key = '';
  facing: Dir = 'down';
  moving = false;
  location: LocationId = 'outdoors';
  samples: Sample[] = [];
  hasLantern = false;
  isST = false;
  constructor(
    readonly scene: TownScene,
    readonly pid: string,
    x: number,
    y: number,
  ) {
    this.sprite = scene.add.sprite(x, y, '__DEFAULT').setOrigin(CHAR.anchor.x / CHAR.frameWidth, CHAR.anchor.y / CHAR.frameHeight);
    this.label = scene.add
      .text(x, y, '', { fontFamily: 'Georgia, serif', fontSize: '7px', color: '#efe6cf', stroke: '#0b0812', strokeThickness: 2, resolution: scene.textRes() })
      .setOrigin(0.5, 1)
      .setDepth(5200);
  }
  setAppearance(kind: SpriteKind, name: string) {
    const key = this.scene.ensureCharacterTexture(kind);
    this.isST = kind.kind === 'storyteller';
    this.hasLantern = kind.kind === 'player' && !kind.ghost && kind.cosmetics.accessory === 'lantern';
    if (this.label.text !== name) this.label.setText(name);
    this.label.setColor(this.isST ? '#e8c76a' : '#efe6cf');
    if (key !== this.key) {
      this.key = key;
      this.sprite.setTexture(key, 0);
      this.play(true);
    }
  }
  setPose(x: number, y: number, facing: Dir, moving: boolean) {
    this.sprite.setPosition(Math.round(x), Math.round(y));
    this.sprite.setDepth(10 + y);
    this.label.setPosition(Math.round(x), Math.round(y) - CHAR.anchor.y - 1);
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
    this.sprite.setVisible(v);
    this.label.setVisible(v);
  }
  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}

export class TownScene extends Phaser.Scene {
  private bridge: TownBridge;
  private offs: (() => void)[] = [];
  // local player
  private myPid: string | null = null;
  private ready = false;
  private me = { x: 0, y: 0, facing: 'down' as Dir, moving: false, location: 'outdoors' as LocationId };
  private seq = 0;
  private fenceSeq = 0;
  private lastSentAt = 0;
  private lastSent = { x: NaN, y: NaN, moving: false, facing: 'down' as Dir };
  private myAvatar: Avatar | null = null;
  // remote
  private avatars = new Map<string, Avatar>();
  // input
  private keys = new Set<string>();
  private pointerTarget: { x: number; y: number } | null = null;
  // views
  private lobby: LobbyRoomView | null = null;
  private gview: PlayerGameView | StorytellerGameView | null = null;
  private phase: Phase = 'waiting';
  // rendering
  private lightSrcs: LightSrc[] = [];
  private lightRT!: Phaser.GameObjects.RenderTexture;
  private mask!: Phaser.GameObjects.Graphics;
  private ambient = { r: 0xd0, g: 0xc8, b: 0xdc };
  private view = { left: 0, top: 0, w: 0, h: 0, init: false };
  private zoom = 3;
  private nearDoor: { b: BuildingDef; exit: boolean } | null = null;
  private lastLocalPublish = { x: NaN, y: NaN, loc: '' };

  constructor(bridge: TownBridge) {
    super({ key: 'town' });
    this.bridge = bridge;
  }

  textRes() {
    return Math.max(1, Math.round(this.zoom * (window.devicePixelRatio || 1)));
  }

  preload() {
    this.load.image('terrain', terrainUrl);
    this.load.image('decor', decorUrl);
    this.load.image('objects', objectsUrl);
    this.load.image('chars', CHARACTERS_URL);
    this.load.spritesheet('lights', lightsUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.tilemapTiledJSON('town', townJsonUrl);
  }

  create() {
    const conn = this.bridge.conn;
    // --- map
    const map = this.make.tilemap({ key: 'town' });
    const terrain = map.addTilesetImage('terrain', 'terrain')!;
    const decor = map.addTilesetImage('decor', 'decor')!;
    map.createLayer('ground', terrain, 0, 0)!.setDepth(0);
    map.createLayer('decor', decor, 0, 0)!.setDepth(1);
    const atlas = this.textures.get('objects');
    for (const [name, r] of Object.entries((objectsAtlas as unknown as { frames: Record<string, { x: number; y: number; w: number; h: number }> }).frames)) atlas.add(name, 0, r.x, r.y, r.w, r.h);
    const layer = map.getObjectLayer('objects');
    for (const o of layer?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      if (type === 'light') {
        this.lightSrcs.push({ x: o.x!, y: o.y!, r: Number(prop(o, 'radius') ?? 40), color: String(prop(o, 'color') ?? 'warm'), building: (prop(o, 'building') as string) || null, facade: !!prop(o, 'facade') });
        continue;
      }
      const frame = String(prop(o, 'frame'));
      const depth = Number(prop(o, 'depth') ?? o.y! + o.height!);
      this.add
        .image(o.x!, o.y!, 'objects', frame)
        .setOrigin(0, 0)
        .setDepth(type === 'flat' ? 2 : 10 + depth);
    }
    // --- lighting + night/interior mask
    // Fixed-size light map (Phaser 3.90 RenderTexture.resize() breaks later draws); covers up to
    // 3200x2000 CSS px at the minimum zoom of 2.
    this.lightRT = this.add.renderTexture(0, 0, 1600, 1000).setOrigin(0, 0).setScrollFactor(0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.mask = this.add.graphics().setDepth(5300);
    this.cameras.main.setBackgroundColor('#09070d');
    this.cameras.main.setRoundPixels(true);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());

    // --- views
    const onLobby = (v: LobbyRoomView | null) => {
      this.lobby = v;
      this.myPid = v?.youPid ?? this.myPid;
      this.refreshAppearances();
    };
    const onGame = (g: PlayerGameView | StorytellerGameView | null) => {
      const prev = this.phase;
      this.gview = g;
      this.phase = g?.phase ?? (this.lobby?.lobby.phase === 'finished' ? 'finished' : 'waiting');
      if (prev !== this.phase) this.onPhaseChange(prev, this.phase);
      this.refreshAppearances();
    };
    onLobby(conn.lobbyView.get());
    onGame(conn.gameView.get());
    this.offs.push(conn.lobbyView.subscribe(onLobby));
    this.offs.push(conn.gameView.subscribe(onGame));
    this.offs.push(conn.events.on('world:teleport', (t) => this.onTeleport(t)));
    this.offs.push(conn.events.on('world:snapshot', (s) => this.onSnapshot(s)));
    this.offs.push(conn.events.on('sound', (s) => playCue(s.cue as Cue)));

    // --- input (window-level so we can ignore typing in inputs)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = keyDir(e.code);
      if (k) {
        this.keys.add(k);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
      if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
        e.preventDefault();
        this.useDoor();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = keyDir(e.code);
      if (k) this.keys.delete(k);
    };
    const blur = () => {
      this.keys.clear();
      this.pointerTarget = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.offs.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
    // press-and-hold on the canvas walks toward the pointer (touch devices)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.pointerTarget = { x: p.worldX, y: p.worldY }));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.pointerTarget = { x: p.worldX, y: p.worldY };
    });
    this.input.on('pointerup', () => (this.pointerTarget = null));
    this.input.on('pointerupoutside', () => (this.pointerTarget = null));

    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private cleanup() {
    for (const off of this.offs.splice(0)) off();
    remoteEntities.clear();
  }

  // ---------------------------------------------------------------------------------------
  // appearances

  ensureCharacterTexture(kind: SpriteKind): string {
    const key = appearanceKey(kind);
    if (this.textures.exists(key)) return key;
    const src = this.textures.get('chars').getSourceImage() as HTMLImageElement;
    const canvas = composeSheet(src, layerKeys(kind));
    const tex = this.textures.addCanvas(key, canvas)!;
    const cols = CHAR.frames.length;
    for (let r = 0; r < CHAR.directions.length; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * CHAR.frameWidth, r * CHAR.frameHeight, CHAR.frameWidth, CHAR.frameHeight);
    const ghost = kind.kind === 'player' && kind.ghost;
    CHAR.directions.forEach((dir, r) => {
      this.anims.create({
        key: `${key}#walk-${dir}`,
        frames: [1, 2, 3, 4].map((c) => ({ key, frame: r * cols + c })),
        frameRate: CHAR.walkFps,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}#idle-${dir}`,
        frames: (ghost ? [0, 1, 2, 3, 4] : [0]).map((c) => ({ key, frame: r * cols + c })),
        frameRate: ghost ? 5 : 1,
        repeat: -1,
      });
    });
    return key;
  }

  private kindFor(pid: string): { kind: SpriteKind; name: string } {
    const m = this.lobby?.members.find((x) => x.pid === pid);
    const isST = m?.role === 'storyteller' || (this.gview?.kind === 'storyteller' && pid === this.myPid);
    if (isST) return { kind: { kind: 'storyteller' }, name: m?.displayName ?? 'Storyteller' };
    const alive = this.gview?.players.find((p) => p.pid === pid)?.alive ?? true;
    const cosmetics: Cosmetics = m?.cosmetics ?? { skin: 'fair', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'none', ghost: 'wisp' };
    return { kind: { kind: 'player', cosmetics, ghost: !alive }, name: m?.displayName ?? '…' };
  }

  private refreshAppearances() {
    if (!this.sys.isActive() && !this.sys.settings.active) return;
    if (this.myAvatar && this.myPid) {
      const k = this.kindFor(this.myPid);
      this.myAvatar.setAppearance(k.kind, k.name);
    }
    for (const [pid, a] of this.avatars) {
      const k = this.kindFor(pid);
      a.setAppearance(k.kind, k.name);
    }
  }

  private amStoryteller(): boolean {
    if (this.gview?.kind === 'storyteller') return true;
    return !!this.lobby?.members.find((m) => m.pid === this.myPid && m.role === 'storyteller');
  }
  private mySeat(): number | null {
    if (this.gview?.kind === 'player') return this.gview.you.seat;
    return this.lobby?.members.find((m) => m.pid === this.myPid)?.seat ?? null;
  }

  // ---------------------------------------------------------------------------------------
  // network

  private placeMe(x: number, y: number, location: LocationId) {
    const prevLoc = this.me.location;
    this.me.x = x;
    this.me.y = y;
    this.me.location = location;
    this.me.moving = false;
    if (!this.myAvatar && this.myPid) {
      this.myAvatar = new Avatar(this, this.myPid, x, y);
      const k = this.kindFor(this.myPid);
      this.myAvatar.setAppearance(k.kind, k.name);
    }
    this.myAvatar?.setPose(x, y, this.me.facing, false);
    if (!this.ready || prevLoc !== location) {
      this.ready = true;
      this.onLocationChange();
      this.view.init = false;
    }
  }

  onTeleport(t: WorldTeleport) {
    if (t.reason === 'correction' && t.seq <= this.fenceSeq) return; // already resolved by a later snap
    this.fenceSeq = this.seq;
    this.lastSent = { x: t.x, y: t.y, moving: false, facing: this.me.facing };
    const changed = t.location !== this.me.location;
    this.placeMe(t.x, t.y, t.location);
    if (t.reason === 'door' && changed) playCue('door');
  }

  onSnapshot(s: WorldSnapshot) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const e of s.entities) {
      if (e.id === this.myPid) {
        if (!this.ready) this.placeMe(e.x, e.y, e.location);
        continue;
      }
      seen.add(e.id);
      let a = this.avatars.get(e.id);
      if (!a) {
        a = new Avatar(this, e.id, e.x, e.y);
        const k = this.kindFor(e.id);
        a.setAppearance(k.kind, k.name);
        a.location = e.location;
        this.avatars.set(e.id, a);
      }
      if (a.location !== e.location) {
        a.samples = []; // went through a door: snap, don't slide across the map
        a.location = e.location;
      }
      a.samples.push({ t: now, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
      if (a.samples.length > 12) a.samples.splice(0, a.samples.length - 12);
    }
    for (const [pid, a] of this.avatars)
      if (!seen.has(pid)) {
        a.destroy();
        this.avatars.delete(pid);
        remoteEntities.delete(pid);
      }
  }

  private useDoor() {
    if (!this.nearDoor || !this.ready) return;
    if (this.doorLocked(this.nearDoor)) return;
    this.bridge.conn.send('world:useDoor', { buildingId: this.nearDoor.b.id });
  }

  private doorLocked(d: { b: BuildingDef; exit: boolean }): boolean {
    if (this.amStoryteller() || !LOCKED.has(this.phase)) return false;
    const home = this.mySeat() === null ? null : `house-${this.mySeat()}`;
    return d.exit ? d.b.id === home : d.b.id !== home;
  }

  // ---------------------------------------------------------------------------------------
  // phase presentation

  private onPhaseChange(prev: Phase, next: Phase) {
    const cam = this.cameras.main;
    const st = this.amStoryteller();
    if (NIGHT.has(next) && !NIGHT.has(prev)) {
      this.bridge.setCaption(st ? 'Night falls. The town sleeps — walk to the homes you must visit.' : 'Night falls. You are alone in your home…');
      if (!st) {
        cam.fadeOut(650, 4, 2, 10);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => cam.fadeIn(1600, 4, 2, 10));
      }
      this.time.delayedCall(4200, () => this.bridge.setCaption(null));
    } else if (next === 'bedtime') {
      this.bridge.setCaption('The bell tolls. Return to your home before dark.');
      this.time.delayedCall(4200, () => this.bridge.setCaption(null));
    } else if (next === 'dawn' && NIGHT.has(prev)) {
      this.bridge.setCaption('Dawn breaks over Hollowmere.');
      if (!st) cam.flash(900, 70, 40, 50);
      this.time.delayedCall(3500, () => this.bridge.setCaption(null));
    }
  }

  private onLocationChange() {
    // interior isolation mask: everything outside the current room is black
    this.mask.clear();
    const b = this.currentBuilding();
    if (b) {
      const r = { x: b.interior.x * TS, y: b.interior.y * TS, w: b.interior.w * TS, h: b.interior.h * TS };
      const big = 4000;
      this.mask.fillStyle(0x09070d, 1);
      this.mask.fillRect(r.x - big, r.y - big, r.w + big * 2, big);
      this.mask.fillRect(r.x - big, r.y + r.h, r.w + big * 2, big);
      this.mask.fillRect(r.x - big, r.y, big, r.h);
      this.mask.fillRect(r.x + r.w, r.y, big, r.h);
    }
    this.publishLocal(true);
  }

  private currentBuilding(): BuildingDef | undefined {
    if (this.me.location === 'outdoors') return undefined;
    const id = this.me.location.slice(4);
    return L.buildings.find((b) => b.id === id);
  }

  // ---------------------------------------------------------------------------------------
  // per-frame

  override update(time: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    if (this.ready && this.myAvatar) {
      this.stepLocal(dt, time);
      this.findDoor();
    }
    this.stepRemotes();
    this.updateCamera(dt);
    this.updateLighting(dt);
  }

  private stepLocal(dt: number, now: number) {
    let vx = 0;
    let vy = 0;
    if (this.keys.has('left')) vx -= 1;
    if (this.keys.has('right')) vx += 1;
    if (this.keys.has('up')) vy -= 1;
    if (this.keys.has('down')) vy += 1;
    if (vx === 0 && vy === 0 && this.pointerTarget) {
      const dx = this.pointerTarget.x - this.me.x;
      const dy = this.pointerTarget.y - (this.me.y - 8);
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        vx = dx / d;
        vy = dy / d;
      }
    }
    const len = Math.hypot(vx, vy);
    let moving = false;
    if (len > 0) {
      vx /= len;
      vy /= len;
      const mult = this.amStoryteller() && this.gview?.kind === 'storyteller' ? Math.min(STORYTELLER_MAX_SPEED_MULT, Math.max(1, this.gview.travelSpeedMult)) : 1;
      const step = PLAYER_SPEED * mult * dt;
      const nx = this.me.x + vx * step;
      const ny = this.me.y + vy * step;
      // axis-separated collision (slides along walls), never changes location
      if (!isBlockedPx(L, nx, this.me.y) && locationAt(L, nx, this.me.y) === this.me.location) this.me.x = nx;
      if (!isBlockedPx(L, this.me.x, ny) && locationAt(L, this.me.x, ny) === this.me.location) this.me.y = ny;
      this.me.facing = Math.abs(vx) > Math.abs(vy) + 0.01 ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
      moving = true;
    }
    this.me.moving = moving;
    this.myAvatar!.setPose(this.me.x, this.me.y, this.me.facing, moving);
    // send at ~15 Hz while something changed
    const changed = Math.abs(this.me.x - this.lastSent.x) > 0.05 || Math.abs(this.me.y - this.lastSent.y) > 0.05 || moving !== this.lastSent.moving || this.me.facing !== this.lastSent.facing;
    if (changed && now - this.lastSentAt >= 1000 / MOVE_HZ) {
      this.seq++;
      const x = Math.round(this.me.x * 100) / 100;
      const y = Math.round(this.me.y * 100) / 100;
      this.bridge.conn.send('move', { seq: this.seq, x, y, facing: this.me.facing, moving });
      this.lastSent = { x: this.me.x, y: this.me.y, moving, facing: this.me.facing };
      this.lastSentAt = now;
    }
    this.publishLocal(false);
  }

  private publishLocal(force: boolean) {
    const p = this.lastLocalPublish;
    if (!force && Math.abs(p.x - this.me.x) < 0.5 && Math.abs(p.y - this.me.y) < 0.5 && p.loc === this.me.location) return;
    this.lastLocalPublish = { x: this.me.x, y: this.me.y, loc: this.me.location };
    localPlayer.set({ pid: this.myPid, x: this.me.x, y: this.me.y, location: this.me.location });
  }

  private stepRemotes() {
    const renderAt = performance.now() - INTERP_DELAY_MS;
    for (const a of this.avatars.values()) {
      const s = a.samples;
      if (!s.length) continue;
      let x = s[s.length - 1]!.x;
      let y = s[s.length - 1]!.y;
      let ref = s[s.length - 1]!;
      for (let i = s.length - 1; i > 0; i--) {
        const s0 = s[i - 1]!;
        const s1 = s[i]!;
        if (s0.t <= renderAt && renderAt <= s1.t) {
          const k = s1.t === s0.t ? 1 : (renderAt - s0.t) / (s1.t - s0.t);
          x = s0.x + (s1.x - s0.x) * k;
          y = s0.y + (s1.y - s0.y) * k;
          ref = s1;
          break;
        }
        if (i === 1 && renderAt < s0.t) {
          x = s0.x;
          y = s0.y;
          ref = s0;
        }
      }
      // treat a sample-less gap as standing still
      const stale = performance.now() - s[s.length - 1]!.t > 600;
      a.setPose(x, y, ref.facing, ref.moving && !stale);
      remoteEntities.set(a.pid, { x, y, location: a.location });
    }
  }

  private findDoor() {
    let best: { b: BuildingDef; exit: boolean; d: number } | null = null;
    for (const b of L.buildings) {
      const exit = this.me.location === `bld:${b.id}`;
      if (!exit && this.me.location !== 'outdoors') continue;
      const c = tileCenterPx(L, exit ? b.interiorDoor : b.door);
      const d = Math.hypot(c.x - this.me.x, c.y - this.me.y);
      if (d <= DOOR_RANGE && (!best || d < best.d)) best = { b, exit, d };
    }
    const prev = this.nearDoor;
    this.nearDoor = best ? { b: best.b, exit: best.exit } : null;
    if (prev?.b.id === this.nearDoor?.b.id && prev?.exit === this.nearDoor?.exit && !this.promptDirty()) return;
    if (!this.nearDoor) return this.bridge.setPrompt(null);
    const locked = this.doorLocked(this.nearDoor);
    const name = this.nearDoor.b.name;
    this.bridge.setPrompt({
      key: 'E',
      locked,
      text: locked ? (this.nearDoor.exit ? 'The door is barred until morning' : 'Locked for the night') : this.nearDoor.exit ? `Leave ${name}` : `Enter ${name}`,
    });
  }
  private lastPromptPhase: Phase = 'waiting';
  private promptDirty() {
    const d = this.lastPromptPhase !== this.phase;
    this.lastPromptPhase = this.phase;
    return d;
  }

  private applyZoom() {
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    this.zoom = Phaser.Math.Clamp(Math.round(Math.min(w / 400, h / 270)), 2, 6);
    cam.setZoom(this.zoom);
    this.lightRT.setPosition((w - w / this.zoom) / 2 - 1, (h - h / this.zoom) / 2 - 1);
    const res = this.textRes();
    for (const a of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) a.label.setResolution(res);
    this.view.init = false;
  }

  /** Manual camera (keeps lighting and scroll in lock-step): follow + clamp to area bounds. */
  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const vw = cam.width / this.zoom;
    const vh = cam.height / this.zoom;
    const b = this.currentBuilding();
    const area = b
      ? { x: (b.interior.x - 1) * TS, y: (b.interior.y - 1) * TS, w: (b.interior.w + 2) * TS, h: (b.interior.h + 2) * TS }
      : { x: L.townBounds.x * TS, y: L.townBounds.y * TS, w: L.townBounds.w * TS, h: L.townBounds.h * TS };
    const tx = this.ready ? this.me.x : L.square.cx;
    const ty = this.ready ? this.me.y - 8 : L.square.cy;
    const clamp = (c: number, lo: number, size: number, view: number) => (size <= view ? lo + (size - view) / 2 : Phaser.Math.Clamp(c - view / 2, lo, lo + size - view));
    const left = clamp(tx, area.x, area.w, vw);
    const top = clamp(ty, area.y, area.h, vh);
    if (!this.view.init) {
      this.view.left = left;
      this.view.top = top;
      this.view.init = true;
    } else {
      const k = 1 - Math.exp(-dt * 12);
      this.view.left += (left - this.view.left) * k;
      this.view.top += (top - this.view.top) * k;
    }
    const L0 = Math.round(this.view.left);
    const T0 = Math.round(this.view.top);
    cam.setScroll(L0 - (cam.width - vw) / 2, T0 - (cam.height - vh) / 2);
    this.view.w = vw;
    this.view.h = vh;
  }

  private updateLighting(dt: number) {
    const inside = this.me.location !== 'outdoors';
    const target = (inside ? AMBIENT_IN : AMBIENT_OUT)[this.phase] ?? 0xffffff;
    const k = 1 - Math.exp(-dt * 1.6);
    this.ambient.r += (((target >> 16) & 255) - this.ambient.r) * k;
    this.ambient.g += (((target >> 8) & 255) - this.ambient.g) * k;
    this.ambient.b += ((target & 255) - this.ambient.b) * k;
    const amb = (Math.round(this.ambient.r) << 16) | (Math.round(this.ambient.g) << 8) | Math.round(this.ambient.b);
    const rt = this.lightRT;
    rt.clear();
    rt.fill(amb, 1);
    const left = Math.round(this.view.left) - 1;
    const top = Math.round(this.view.top) - 1;
    const night = NIGHT.has(this.phase);
    const dusk = this.phase === 'bedtime' || this.phase === 'dawn';
    const lampK = night ? 1 : dusk ? 0.8 : 0.28;
    const facadeK = night ? 0.95 : dusk ? 0.6 : 0;
    const here = inside ? this.me.location.slice(4) : null;
    const stamp = (x: number, y: number, r: number, color: number, alpha: number, soft = 0) => {
      if (alpha <= 0.01) return;
      if (x + r < left || y + r < top || x - r > left + this.view.w + 2 || y - r > top + this.view.h + 2) return;
      rt.stamp('lights', soft, x - left, y - top, { scale: (r * 2) / 128, tint: color, alpha, blendMode: Phaser.BlendModes.ADD });
    };
    const flicker = (x: number) => 0.92 + 0.08 * Math.sin(this.time.now / 130 + x * 0.37) * Math.sin(this.time.now / 370 + x);
    for (const l of this.lightSrcs) {
      if (l.building !== here) continue;
      const tint = LIGHT_TINT[l.color] ?? LIGHT_TINT.warm!;
      if (inside) stamp(l.x, l.y, l.r * 1.3, tint, (l.color === 'fire' ? 0.85 : 0.6) * flicker(l.x), 1);
      else if (l.facade) stamp(l.x, l.y, l.r, tint, facadeK * 0.7 * flicker(l.y));
      else stamp(l.x, l.y, l.r * 0.85, tint, lampK * 0.8 * flicker(l.x + l.y), 0);
    }
    const dark = night || dusk;
    // carried lights: storyteller lantern, lantern accessories, and a faint aura for yourself
    const carried = (a: Avatar, x: number, y: number) => {
      if (a.isST) stamp(x, y - 12, a === this.myAvatar && night ? 104 : 70, LIGHT_TINT.st!, dark ? 0.95 : 0.25, 0);
      else if (a.hasLantern) stamp(x, y - 10, 46, LIGHT_TINT.lantern!, dark ? 0.75 : 0.15, 1);
    };
    for (const a of this.avatars.values()) if (a.sprite.visible) carried(a, a.sprite.x, a.sprite.y);
    if (this.myAvatar && this.ready) {
      carried(this.myAvatar, this.me.x, this.me.y);
      if (dark && !this.myAvatar.isST) stamp(this.me.x, this.me.y - 10, 44, 0x9aa4d8, 0.35, 1);
    }
  }
}

function prop(o: Phaser.Types.Tilemaps.TiledObject, name: string): unknown {
  const p = o.properties as unknown;
  if (Array.isArray(p)) return (p as { name: string; value: unknown }[]).find((x) => x.name === name)?.value;
  if (p && typeof p === 'object') return (p as Record<string, unknown>)[name];
  return undefined;
}

function keyDir(code: string): 'up' | 'down' | 'left' | 'right' | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'up';
    case 'KeyS':
    case 'ArrowDown':
      return 'down';
    case 'KeyA':
    case 'ArrowLeft':
      return 'left';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  const a = document.activeElement as HTMLElement | null;
  for (const n of [el, a]) {
    if (!n) continue;
    const tag = n.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable) return true;
  }
  return false;
}

/** Spawn-free helper used before the first server position arrives. */
export const squareCenter = () => tileCenterPx(L, L.playerSpawn);
