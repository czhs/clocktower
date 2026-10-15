// OWNED BY world-art (render core). The Phaser town scene: wiring of the render modules
// (render/: world map + occlusion, actors + labels + shadows, camera + overlay camera, lighting,
// foreground; fx/: atmosphere, grade, quality; AmbientLayer: ambient life), plus the parts that
// are game logic on the client: network views, local movement/prediction (stepLocal), remote
// interpolation (with privacy filtering), doors, phase presentation and the gameplay/eggs hooks.
import * as Phaser from 'phaser';
import { townLayout, townMap } from '@ct/assets';
import terrainUrl from '@ct/assets/generated/terrain.png';
import decorUrl from '@ct/assets/generated/decor.png';
import objectsUrl from '@ct/assets/generated/objects.png';
import buildingsDayUrl from '@ct/assets/generated/buildings-day.png';
import buildingsNightUrl from '@ct/assets/generated/buildings-night.png';
import foregroundBakedUrl from '@ct/assets/generated/foreground-baked.png';
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
import { AmbientLayer, ambientTime } from './AmbientLayer';
import { mountEggs } from './eggs';
import { playCue, type Cue } from './audio';
import { FxLayer } from './fx/FxLayer';
import { reducedMotion } from './fx/motion';
import { FxQualityController } from './fx/quality';
import { ensureFxTextures } from './fx/textures';
import { createGameplayLayer, type GameplayLayer } from './gameplay';
import { Avatar, createCharacterAnims, LabelLayout, type ActorHost } from './render/Actors';
import { CameraRig } from './render/CameraRig';
import { Foreground, foregroundItems } from './render/Foreground';
import { Lighting, type Carrier } from './render/Lighting';
import { Plates } from './render/Plates';
import { MUTED_ICON, MUTED_ICON_URL, VoiceMarks } from './render/VoiceMarks';
import { WorldMap } from './render/WorldMap';
import { appearanceKey, CHAR, CHARACTERS_URL, composeSheet, layerKeys, type SpriteKind } from './sprites';

const L = townLayout;
const TS = L.tileSize;
const MOVE_HZ = 15;
const INTERP_DELAY_MS = 110;
const DOOR_RANGE = 20; // a little tighter than the server's 22 px
const CORNER_NUDGE = 4; // px, see stepLocal
const LOCKED: ReadonlySet<string> = new Set(['first_night', 'night', 'dawn']);
const NIGHT: ReadonlySet<string> = new Set(['first_night', 'night']);

type Phase = GamePhase | 'waiting';
type Dir = Facing;

export interface TownBridge {
  conn: RoomConnection;
  setPrompt(p: { key: string; text: string; locked?: boolean } | null): void;
  setCaption(c: string | null): void;
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
  private phaseStart = { at: Date.now(), phase: '' };
  // render modules
  private world!: WorldMap;
  private rig!: CameraRig;
  private lighting!: Lighting;
  private labels = new LabelLayout();
  private plates!: Plates;
  private foreground!: Foreground;
  private life!: AmbientLayer;
  private fx!: FxLayer;
  private fxQuality!: FxQualityController;
  private mask!: Phaser.GameObjects.Graphics;
  private host!: ActorHost;
  private clockAlpha = 1;
  private nearDoor: { b: BuildingDef; exit: boolean } | null = null;
  private lastLocalPublish = { x: NaN, y: NaN, loc: '' };
  private gameplay: GameplayLayer | null = null;
  private voice!: VoiceMarks;

  constructor(bridge: TownBridge) {
    super({ key: 'town' });
    this.bridge = bridge;
  }

  /** Camera view in world px (shared with the camera rig; dev review tooling writes into it). */
  get view() {
    return this.rig.view;
  }
  get zoom() {
    return this.rig.zoom;
  }

  textRes() {
    return Math.max(1, Math.round(this.zoom * (window.devicePixelRatio || 1)));
  }
  /** Name labels are drawn at 1/zoom world scale, i.e. 1 text px = 1 CSS px. */
  labelRes() {
    return Math.max(1, window.devicePixelRatio || 1);
  }

  preload() {
    this.load.image('terrain', terrainUrl);
    this.load.image('decor', decorUrl);
    this.load.image('objects', objectsUrl);
    this.load.image('buildings-day', buildingsDayUrl);
    this.load.image('buildings-night', buildingsNightUrl);
    this.load.image('foreground-baked', foregroundBakedUrl);
    this.load.image('chars', CHARACTERS_URL);
    this.load.spritesheet('lights', lightsUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.tilemapTiledJSON('town', townJsonUrl);
    this.load.image(MUTED_ICON, MUTED_ICON_URL);
  }

  create() {
    const conn = this.bridge.conn;
    ensureFxTextures(this);
    this.rig = new CameraRig(this, this.offs);
    this.host = { scene: this, ensureCharacterTexture: (k) => this.ensureCharacterTexture(k), toOverlay: (o) => this.rig.toOverlay(o), labelRes: () => this.labelRes() };
    this.world = new WorldMap(this);
    this.foreground = new Foreground(this, foregroundItems(), this.world.props.filter((p) => /^(oak|oak2|pine|pinetall|fruittree|willow|yew|deadtree)(_b)?$/.test(p.frame)));
    this.life = new AmbientLayer(
      this,
      this.world.lights.filter((l) => l.color === 'fire' && l.building),
    );
    this.lighting = new Lighting(this, this.world.lights, this.world.props);
    this.fxQuality = new FxQualityController(performance.now(), this.renderer.type === Phaser.WEBGL);
    this.fx = new FxLayer(this, this.world.lights, this.world.props, (on) => this.life.setFallback(on), (l) => this.lighting.lampK(l));
    this.fx.setBellTower(this.world.clockTop);
    this.applyQuality();
    this.plates = new Plates(this, () => this.textRes());
    this.voice = new VoiceMarks(this, (o) => this.rig.toOverlay(o), this.offs);
    // interior isolation mask (everything outside the current room is black)
    this.mask = this.add.graphics().setDepth(5300);
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
    this.offs.push(
      conn.events.on('sound', (s) => {
        playCue(s.cue as Cue);
        // public cues only: the bells swing in the belfry
        if (s.cue === 'bell' || s.cue === 'toll') {
          this.life.bell();
          this.fx.bell();
        }
      }),
    );

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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.pointerTarget = { x: world.x, y: world.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        const world = this.cameras.main.getWorldPoint(p.x, p.y);
        this.pointerTarget = { x: world.x, y: world.y };
      }
    });
    this.input.on('pointerup', () => (this.pointerTarget = null));
    this.input.on('pointerupoutside', () => (this.pointerTarget = null));

    // CMU easter eggs (cmu-eggs): mounted once the town is rendered
    const phaseSubs = new Set<(p: string) => void>();
    this.onPhaseSubs = phaseSubs;
    const unmountEggs = mountEggs(this, {
      layout: L,
      townMap,
      localPlayer,
      phase: () => this.phase,
      onPhase: (cb) => {
        phaseSubs.add(cb);
        return () => phaseSubs.delete(cb);
      },
      showPopup: (c) => {
        this.bridge.setCaption(typeof c === 'string' ? c : `${c.title} — ${c.body}`);
        this.time.delayedCall(4200, () => this.bridge.setCaption(null));
      },
      depthFor: (bottomY) => 10 + bottomY,
      layers: { ground: 3, air: 4000, lighting: 5000 },
      objectsTexture: 'objects',
    });
    if (unmountEggs) this.offs.push(unmountEggs);

    this.gameplay = createGameplayLayer(this, { conn, myPid: () => this.myPid, me: () => this.me, amStoryteller: () => this.amStoryteller() });
    this.offs.push(() => {
      this.gameplay?.destroy();
      this.gameplay = null;
    });

    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  /** Render a game object on the overlay camera only (crisp, ungraded, never blurred). */
  toOverlay(o: Phaser.GameObjects.GameObject) {
    this.rig.toOverlay(o);
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
    createCharacterAnims(this, key, kind.kind === 'player' && kind.ghost);
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
    this.plates.refresh(this.lobby, this.myPid);
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
      this.myAvatar = new Avatar(this.host, this.myPid, x, y);
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
    if (t.reason === 'door' && changed) {
      playCue('door');
      if (t.location === 'outdoors') this.swingDoorNear(t.x, t.y);
    }
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
        // someone visible stepped out of a door next to us
        if (this.ready && e.location === 'outdoors' && this.me.location === 'outdoors') this.swingDoorNear(e.x, e.y);
        a = new Avatar(this.host, e.id, e.x, e.y);
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
        // a visible avatar vanished right at a door: it went inside
        if (a.location === 'outdoors' && this.me.location === 'outdoors' && a.sprite.visible) this.swingDoorNear(a.sprite.x, a.sprite.y);
        a.destroy();
        this.avatars.delete(pid);
        remoteEntities.delete(pid);
      }
  }

  private swingDoorNear(x: number, y: number) {
    for (const b of L.buildings) {
      const c = tileCenterPx(L, b.door);
      if (Math.hypot(c.x - x, c.y - y) <= 26) return this.life.doorSwing(b, ambientTime());
    }
  }

  private useDoor() {
    if (!this.nearDoor || !this.ready) return;
    if (this.doorLocked(this.nearDoor)) return;
    this.bridge.conn.send('world:useDoor', { buildingId: this.nearDoor.b.id });
  }

  private doorLocked(d: { b: BuildingDef; exit: boolean }): boolean {
    if (this.amStoryteller() || !LOCKED.has(this.phase)) return false;
    const o = this.gameplay?.doorOverride(d.b.id);
    if (o !== null && o !== undefined) return o;
    const home = this.mySeat() === null ? null : `house-${this.mySeat()}`;
    return d.exit ? d.b.id === home : d.b.id !== home;
  }

  // ---------------------------------------------------------------------------------------
  // phase presentation

  private onPhaseSubs = new Set<(p: string) => void>();
  private createdAt = Date.now();
  private onPhaseChange(prev: Phase, next: Phase) {
    this.phaseStart = { at: Date.now(), phase: next };
    // joining mid-game: show the current phase's light at once instead of a 10 s transition
    if (prev === 'waiting' && Date.now() - this.createdAt < 5000) {
      this.lighting?.snap();
      this.fx?.snap();
    }
    for (const cb of this.onPhaseSubs) cb(next);
    const cam = this.cameras.main;
    const st = this.amStoryteller();
    if (NIGHT.has(next) && !NIGHT.has(prev)) {
      this.bridge.setCaption(st ? 'Night falls. The town sleeps — walk to the homes you must visit.' : 'Night falls. You are alone in your home…');
      if (!st) this.rig.fadeThrough(650, 1600, 4, 2, 10);
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

  /** Public phase progress 0..1 from the public phaseEndsAt (null if unknown). */
  private phaseProgress(): number | null {
    const endsAt = this.gview?.phaseEndsAt ?? null;
    const ps = this.phaseStart;
    return endsAt && ps.phase === this.phase && endsAt > ps.at ? Math.min(1, (Date.now() - ps.at) / (endsAt - ps.at)) : null;
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
    this.gameplay?.update(dt);
    const bodies = this.visibleBodies();
    this.clockAlpha = this.world.fade(this.me.location === 'outdoors' ? bodies : [], dt);
    this.life.setClockAlpha(this.clockAlpha);
    this.updateCamera(dt);
    this.life.setClockOffset(this.world.parallax(this.view, reducedMotion()));
    this.updateLighting(dt);
    this.updateFx(dt, deltaMs, bodies);
    this.labels.layout(this.ready ? this.myAvatar : null, this.avatars.values(), this.view, this.zoom, { w: this.cameras.main.width, h: this.cameras.main.height }, dt, (x, y) => this.me.location === 'outdoors' && this.world.covered(x, y));
    this.updateVoiceMarks();
    this.rig.sync();
  }

  /** Local movement + prediction: the ONE place the local avatar moves (gameplay hooks go here). */
  private stepLocal(dt: number, now: number) {
    const d = this.gameplay?.drive(dt) ?? null;
    if (d) {
      this.me.x = d.x;
      this.me.y = d.y;
      this.me.facing = d.facing;
      this.me.moving = d.moving;
      this.myAvatar!.setPose(d.x, d.y, d.facing, d.moving);
      if (d.moving) this.life.footstep('me', d.x, d.y, ambientTime());
      this.lastSent = { x: d.x, y: d.y, moving: false, facing: d.facing };
      this.publishLocal(false);
      return;
    }
    let vx = 0;
    let vy = 0;
    if (this.keys.has('left')) vx -= 1;
    if (this.keys.has('right')) vx += 1;
    if (this.keys.has('up')) vy -= 1;
    if (this.keys.has('down')) vy += 1;
    if (vx === 0 && vy === 0 && this.pointerTarget) {
      const dx = this.pointerTarget.x - this.me.x;
      const dy = this.pointerTarget.y - (this.me.y - 8);
      const dd = Math.hypot(dx, dy);
      if (dd > 6) {
        vx = dx / dd;
        vy = dy / dd;
      }
    }
    const len = Math.hypot(vx, vy);
    let moving = false;
    if (len > 0) {
      vx /= len;
      vy /= len;
      const mult = this.amStoryteller() && this.gview?.kind === 'storyteller' ? Math.min(STORYTELLER_MAX_SPEED_MULT, Math.max(1, this.gview.travelSpeedMult)) : 1;
      const step = PLAYER_SPEED * mult * dt;
      const sx = vx * step;
      const sy = vy * step;
      // axis-separated collision (slides along walls), never changes location
      const free = (x: number, y: number) => !isBlockedPx(L, x, y) && locationAt(L, x, y) === this.me.location;
      let movedX = false;
      let movedY = false;
      if (free(this.me.x + sx, this.me.y)) {
        this.me.x += sx;
        movedX = true;
      }
      if (free(this.me.x, this.me.y + sy)) {
        this.me.y += sy;
        movedY = true;
      }
      // corner nudge (docs/world-audit.md, packages/assets/test/navsim.ts stepClient): when the
      // dominant axis is blocked but a gap opens within CORNER_NUDGE px on the other axis, slide
      // toward it (at most one frame's step). The server accepts these small lateral moves.
      if (!movedX && Math.abs(vx) > 0.5 && Math.abs(sy) < 0.5 * step) {
        for (let off = 1; off <= CORNER_NUDGE; off++) {
          const dirs = vy !== 0 ? [Math.sign(vy)] : [1, -1];
          const s = dirs.find((q) => free(this.me.x, this.me.y + q * off) && free(this.me.x + Math.sign(vx) * Math.max(1, Math.abs(sx)), this.me.y + q * off));
          if (s !== undefined) {
            const ty = this.me.y + s * Math.min(off, step);
            if (free(this.me.x, ty)) this.me.y = ty;
            break;
          }
        }
      } else if (!movedY && Math.abs(vy) > 0.5 && Math.abs(sx) < 0.5 * step) {
        for (let off = 1; off <= CORNER_NUDGE; off++) {
          const dirs = vx !== 0 ? [Math.sign(vx)] : [1, -1];
          const s = dirs.find((q) => free(this.me.x + q * off, this.me.y) && free(this.me.x + q * off, this.me.y + Math.sign(vy) * Math.max(1, Math.abs(sy))));
          if (s !== undefined) {
            const tx = this.me.x + s * Math.min(off, step);
            if (free(tx, this.me.y)) this.me.x = tx;
            break;
          }
        }
      }
      this.me.facing = Math.abs(vx) > Math.abs(vy) + 0.01 ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
      moving = true;
    }
    this.me.moving = moving;
    this.myAvatar!.setPose(this.me.x, this.me.y, this.me.facing, moving);
    if (moving) this.life.footstep('me', this.me.x, this.me.y, ambientTime());
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
      // Defence in depth for night privacy: only render (sprite, label, shadow, walk animation,
      // carried light) entities in the same location as us. The server already filters snapshots.
      const show = this.ready && a.location === this.me.location;
      a.setVisible(show);
      if (show) {
        a.setPose(x, y, ref.facing, ref.moving && !stale);
        if (ref.moving && !stale) this.life.footstep(a.pid, x, y, ambientTime());
      } else if (a.sprite.anims.isPlaying) a.sprite.anims.stop();
      remoteEntities.set(a.pid, { x, y, location: a.location });
    }
  }

  /** Speaking rings under visible characters, muted icon by our own name. */
  private updateVoiceMarks() {
    const bodies: { pid: string; x: number; y: number }[] = [];
    if (this.ready && this.myPid && this.myAvatar) bodies.push({ pid: this.myPid, x: this.myAvatar.sprite.x, y: this.myAvatar.sprite.y });
    for (const a of this.avatars.values()) if (a.sprite.visible && a.location === this.me.location) bodies.push({ pid: a.pid, x: a.sprite.x, y: a.sprite.y });
    const dark = NIGHT.has(this.phase) ? 1 : this.phase === 'bedtime' || this.phase === 'dawn' ? 0.7 : 0;
    this.voice.update(bodies, this.myPid, this.ready && this.myAvatar ? this.myAvatar.label : null, this.zoom, dark, reducedMotion());
  }

  /** Feet of every character we can see in our own location (incl. ourselves). */
  private visibleBodies(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    if (this.ready) out.push({ x: this.me.x, y: this.me.y });
    for (const a of this.avatars.values()) if (a.sprite.visible && a.location === this.me.location) out.push({ x: a.sprite.x, y: a.sprite.y });
    return out;
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
    this.rig.applyZoom();
    this.lighting.place(this.rig.screenOrigin());
    const lres = this.labelRes();
    for (const a of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) if (a.label.style.resolution !== lres) a.label.setResolution(lres);
    this.plates.setResolution(this.textRes());
  }

  /** Manual camera (keeps lighting and scroll in lock-step): lagging follow, clamped to the area. */
  private updateCamera(dt: number) {
    const b = this.currentBuilding();
    const area = b
      ? { x: (b.interior.x - 1) * TS, y: (b.interior.y - 1) * TS, w: (b.interior.w + 2) * TS, h: (b.interior.h + 2) * TS }
      : { x: L.townBounds.x * TS, y: L.townBounds.y * TS, w: L.townBounds.w * TS, h: L.townBounds.h * TS };
    const target = this.ready ? { x: this.me.x, y: this.me.y - 8 } : { x: L.square.cx, y: L.square.cy };
    // the square: frame the gathering ring (look a little south of the tower toward the apron) so
    // the playable ring has breathing room instead of filling the view with tower masonry
    if (!b) {
      const d = Math.hypot(target.x - L.square.cx, target.y - L.square.cy);
      const w = Phaser.Math.Clamp(1 - d / (L.square.r + 32), 0, 1);
      target.y += 26 * w;
    }
    this.rig.follow(dt, target, area);
  }

  private updateLighting(dt: number) {
    const inside = this.me.location !== 'outdoors';
    const here = inside ? this.me.location.slice(4) : null;
    const night = NIGHT.has(this.phase);
    const dusk = this.phase === 'bedtime' || this.phase === 'dawn';
    const progress = this.phaseProgress();
    // carried lights / moonlit auras: avatars visible to us in our own location, and ourselves
    const carriers: Carrier[] = [];
    for (const a of this.avatars.values()) if (a.sprite.visible && a.location === this.me.location) carriers.push({ x: a.sprite.x, y: a.sprite.y, st: a.isST, lantern: a.hasLantern, mine: false });
    if (this.myAvatar && this.ready) carriers.push({ x: this.me.x, y: this.me.y, st: this.myAvatar.isST, lantern: this.myAvatar.hasLantern, mine: true });
    const view = { left: this.view.left, top: this.view.top, w: this.view.w, h: this.view.h };
    this.lighting.update({ dt, phase: this.phase, inside, here, view, zoom: this.zoom, progress, sinceMs: Date.now() - this.phaseStart.at, carriers });
    this.world.updatePhase(this.phase, dt);
    // ambient life (public, deterministic; see AmbientLayer)
    this.life.update({ t: ambientTime(), dt, phase: this.phase, night, dusk, inside, here, view, stamp: this.lighting.stamp, progress });
  }

  private applyQuality() {
    const q = this.fxQuality.level;
    this.fx.setQuality(q);
    this.foreground.setQuality(q);
  }

  /** HD-2D atmosphere (fx/FxLayer) + foreground + avatar shadows/rim/idle bounce + auto quality. */
  private updateFx(dt: number, deltaMs: number, bodies: { x: number; y: number }[]) {
    if (this.fxQuality.sample(deltaMs, performance.now())) this.applyQuality();
    const inside = this.me.location !== 'outdoors';
    const night = NIGHT.has(this.phase);
    const dusk = this.phase === 'bedtime' || this.phase === 'dawn';
    const here = inside ? this.me.location.slice(4) : null;
    const t = ambientTime();
    const view = { left: this.view.left, top: this.view.top, w: this.view.w, h: this.view.h };
    this.fx.update({ t, dt, phase: this.phase, night, dusk, inside, here, view, clockAlpha: this.clockAlpha });
    this.foreground.update(dt, view, bodies, !inside, this.rig.screenOrigin(), reducedMotion());
    const rimOn = this.fx.quality !== 'low';
    // how much of the ambient darkening the actor-identity boost compensates
    const dark = inside ? (night ? 0.5 : 0) : night ? 1 : dusk ? 0.6 : 0;
    const still = reducedMotion();
    const now = performance.now() / 1000;
    for (const a of this.avatars.values()) if (a.sprite.visible) a.fx(now, this.fx.lightAt(a.sprite.x, a.sprite.y), rimOn, dark, still);
    if (this.myAvatar && this.ready) this.myAvatar.fx(now, this.fx.lightAt(this.myAvatar.sprite.x, this.myAvatar.sprite.y), rimOn, dark, still);
  }
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
