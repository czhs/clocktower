// The Phaser town (v2: the whole town is ONE SCREEN). Tilemap + y-sorted objects from the
// generated v1-style pixel art, 8-direction cast sprites, client prediction against the shared
// collision helpers, server reconciliation, interpolation of remote entities, day/night lighting.
//
//   camera     zoomed so the whole town square always fits on screen (everyone in the square sees
//              everyone else in it) but never the whole town: it rests on the square while you're
//              in it and follows you toward the cottages at the edge. Inside a cottage it shows that
//              cottage's room instead, with freely moving occupants
//   doors      automatic: walking INTO a doorway enters (only when you push toward the door);
//              doors swing open as you approach (local animation only, nobody else sees it);
//              inside, walk into the doorway or use Leave / Escape to go back out
//   tap-to-go  tap/click a cottage to walk to its door and go in, or a spot to walk there;
//              the Storyteller's click teleports instead (with a poof)
//   boards     a bulletin board by each door: who lives there + who is inside, DAYTIME ONLY
//              (from the server's public door tags); at night every cottage looks the same
//   ambience   chimney smoke, flickering lamps, fireflies, a few plain townsfolk by day —
//              phase-driven; daytime townsfolk also avoid visible Brianbi avatars locally
import * as Phaser from 'phaser';
import { castById, PLAYABLE, PLAZA, townLayout, townMap } from '@ct/assets';
import objectsAtlas from '@ct/assets/generated/objects.json';
import terrainUrl from '@ct/assets/generated/terrain.png';
import decorUrl from '@ct/assets/generated/decor.png';
import objectsUrl from '@ct/assets/generated/objects.png';
import lightsUrl from '@ct/assets/generated/lights.png';
import castJson from '@ct/assets/generated/cast.json';
import castUrl from '@ct/assets/generated/cast.png';
import townJsonUrl from '@ct/assets/generated/town.json?url';
import {
  isBlockedPx,
  locationAt,
  PLAYER_SPEED,
  STORYTELLER_MAX_SPEED_MULT,
  tileCenterPx,
  type BuildingDef,
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
import { createGameplayLayer, doorTagsStore, stagePick, type DoorBoardView, type GameplayLayer } from './gameplay';
import { findPath, nearestFree, segmentClear } from './path';
import { createNpcRoamer, stepNpcRoamer, type NpcRoamer } from './npcRoaming';
import { createSocialLayer, type SocialLayer } from './social';
import { noteServerTime, serverNow } from '../net/serverTime';
import { createChatBubbles, type ChatBubbles } from './chatBubbles';
import { reducedMotion } from './fx/motion';

const L = townLayout;
const TS = L.tileSize;
const TOWN = { x: L.townBounds.x * TS, y: L.townBounds.y * TS, w: L.townBounds.w * TS, h: L.townBounds.h * TS };
const MOVE_HZ = 15;
const INTERP_DELAY_MS = 110;
/** Forgiving doorstep trigger; still inside the server's 22px door-use range. */
const DOOR_TRIGGER = 20;
/** Doors swing open for you within this distance (px). */
const DOOR_OPEN_RANGE = 34;
/** The square's preset view (world px): the whole circle plus the clock tower's face above it. */
const SQUARE_VIEW = { x: PLAZA.cx - 200, y: 56, w: 400, h: PLAZA.cy + PLAZA.ry + 18 - 56 };
const LOCKED: ReadonlySet<string> = new Set(['first_night', 'night', 'dawn']);
const NIGHT: ReadonlySet<string> = new Set(['first_night', 'night']);
/** Phases with daytime life on the square (townsfolk, boards). */
const DAYLIKE: ReadonlySet<string> = new Set(['waiting', 'setup', 'day', 'finished']);

type Phase = GamePhase | 'waiting';

// ---------------------------------------------------------------------------------------
// Cast sheets (generated/cast.json): 8 directions x 5 frames per character key.

interface CastManifest {
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  directions: readonly Dir8[];
  frames: readonly string[];
  walkFps: number;
  sheets: Record<string, { x: number; y: number }>;
}
const CAST = castJson as unknown as CastManifest;
// HD cast members use authored walking frames with smooth texture filtering.
interface CastHdManifest {
  scale: number;
  directions: readonly Dir8[];
  frameWidth: number;
  frameHeight: number;
  rows: Record<string, number>;
  frames: readonly string[];
  walkFps: number;
}
const CAST_HD_PNG = Object.values(import.meta.glob('../../../../packages/assets/generated/cast-hd.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)[0];
const CAST_HD = Object.values(import.meta.glob('../../../../packages/assets/generated/cast-hd.json', { eager: true, import: 'default' }) as Record<string, CastHdManifest>)[0];
type Dir8 = 'down' | 'down-right' | 'right' | 'up-right' | 'up' | 'up-left' | 'left' | 'down-left';
const DIR8: readonly Dir8[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const fromFacing = (f: Facing): Dir8 => f;
/** 8-way direction of a vector (screen coords). */
function dir8(vx: number, vy: number): Dir8 {
  const a = Math.atan2(vy, vx);
  const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return DIR8[k]!;
}
/** Server facing (4-way) for an 8-way direction. */
function toFacing(d: Dir8, vx: number, vy: number): Facing {
  if (d === 'left' || d === 'right' || d === 'up' || d === 'down') return d;
  return Math.abs(vx) > Math.abs(vy) + 0.01 ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
}

// ---------------------------------------------------------------------------------------
// Square props / ambient FX (generated/square-props.*, drawn by the fx art agent). Optional:
// everything degrades to simple shapes while the sheet does not exist yet.

const FX_PNG = Object.values(import.meta.glob('../../../../packages/assets/generated/square-props.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)[0];
const FX_JSON = Object.values(import.meta.glob('../../../../packages/assets/generated/square-props.json', { eager: true, import: 'default' }) as Record<string, unknown>)[0] as
  | {
      frames: Record<string, { x: number; y: number; w: number; h: number }>;
      meta?: {
        boardParchment?: { x: number; y: number; w: number; h: number };
        fps?: Record<string, number>;
        anchors?: Record<string, { x: number; y: number }>;
        /** Per cottage: exact overlays for an empty house + world points for board / door glow / smoke. */
        houses?: Record<string, { boarded?: Ov; unlit?: Ov; doorglow?: { x: number; y: number }; board?: { x: number; y: number }; smoke?: { x: number; y: number } }>;
      };
    }
  | undefined;

/** An overlay frame placed at world (wx, wy) = its top-left. */
interface Ov {
  frame: string;
  w: number;
  h: number;
  wx: number;
  wy: number;
}
const FX_HOUSES = FX_JSON?.meta?.houses ?? {};

export interface InsideInfo {
  buildingId: string;
  name: string;
  /** Display names of the others inside with you (visible to you anyway). */
  others: string[];
  /** Leaving is currently allowed. */
  canLeave: boolean;
  /** Why not (shown on the disabled button). */
  lockedReason?: string;
}

export interface TownBridge {
  conn: RoomConnection;
  setPrompt(p: { key: string; text: string; locked?: boolean } | null): void;
  setCaption(c: string | null): void;
  /** Inside a cottage (or null outdoors): drives the "Inside … with …" panel + Leave button. */
  setInside?(i: InsideInfo | null): void;
  /** The scene registers how the HUD's Leave button leaves. */
  registerLeave?(fn: (() => void) | null): void;
}

const AMBIENT_OUT: Record<Phase, number> = {
  waiting: 0xd8d0e2,
  setup: 0xccc0d8,
  day: 0xeae5f0,
  bedtime: 0xa08aa6,
  first_night: 0x2c3260,
  night: 0x2c3260,
  dawn: 0xc8a4b2,
  finished: 0xeae5f0,
};
const AMBIENT_IN: Record<Phase, number> = {
  waiting: 0xd2c4b0,
  setup: 0xc8b8a6,
  day: 0xd8cab8,
  bedtime: 0x9a8090,
  first_night: 0x5a4a6e,
  night: 0x5a4a6e,
  dawn: 0xa48c9a,
  finished: 0xd8cab8,
};
const LIGHT_TINT: Record<string, number> = { warm: 0xffb868, cool: 0x8a9ad0, fire: 0xff9440, holy: 0xc89aff, lantern: 0xffc070, st: 0xffcf7a };
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

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
  facing: Facing;
  moving: boolean;
}
interface DoorObj {
  b: BuildingDef;
  /** Tile-centre feet position of the outdoor door tile. */
  at: { x: number; y: number };
  /** Unit vector pointing INTO the cottage. */
  inward: { x: number; y: number };
  /** Optional swing animation (buildings art: leaf + doorway frames). */
  leaf?: Phaser.GameObjects.Image;
  hole?: Phaser.GameObjects.Image;
  open: number;
}

// ---------------------------------------------------------------------------------------

class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  key = '';
  dir: Dir8 = 'down';
  moving = false;
  location: LocationId = 'outdoors';
  samples: Sample[] = [];
  /** Last rendered position (for 8-way facing from motion). */
  last = { x: NaN, y: NaN };
  hasLantern = false;
  isST = false;
  ghost = false;
  /** Drawn from the cast-hd texture (see CAST_HD). */
  hd = false;
  private still = false;
  /** World size, independent of how many source pixels the texture uses. */
  get worldScale() { return this.location === 'outdoors' ? 1 : 2 / 3; }
  constructor(
    readonly scene: TownScene,
    readonly pid: string,
    x: number,
    y: number,
  ) {
    this.sprite = scene.add.sprite(x, y, 'cast').setOrigin(CAST.anchor.x / CAST.frameWidth, CAST.anchor.y / CAST.frameHeight);
    this.label = scene.add
      .text(x, y, '', { fontFamily: LABEL_FONT, fontSize: `${scene.fontPx(10.5)}px`, fontStyle: '700', color: '#efe6cf', stroke: '#0b0812', strokeThickness: Math.max(1.5, scene.fontPx(10.5) / 4), resolution: scene.textRes() })
      .setOrigin(0.5, 1)
      .setDepth(5200);
  }
  setAppearance(key: string, name: string, opts: { st: boolean; lantern: boolean; ghost: boolean }) {
    this.isST = opts.st;
    this.hasLantern = opts.lantern && !opts.ghost;
    this.ghost = opts.ghost;
    if (this.label.text !== name) this.label.setText(name);
    this.label.setColor(this.isST ? '#e8c76a' : opts.ghost ? '#cfe6ee' : '#efe6cf');
    if (key !== this.key) {
      this.key = key;
      this.play(true);
    }
  }
  setPose(x: number, y: number, dir: Dir8, moving: boolean) {
    const still = reducedMotion();
    if (dir !== this.dir || moving !== this.moving || still !== this.still) {
      this.dir = dir;
      this.moving = moving;
      this.still = still;
      this.play();
    }
    const scale = this.worldScale;
    this.sprite.setScale(this.hd ? scale / CAST_HD!.scale : scale);
    const bob = this.hd && this.ghost ? -3 - (still ? 0 : Math.sin(this.scene.time.now / 1000 * 2.2)) : 0;
    this.sprite.setPosition(this.hd ? x : Math.round(x), (this.hd ? y : Math.round(y)) + bob * scale);
    this.sprite.setDepth(10 + y);
    this.label.setPosition(Math.round(x), Math.round(y) - (CAST.anchor.y - 4 + (this.ghost ? 4 : 0)) * scale);
    this.last = { x, y };
  }
  play(force = false) {
    if (!this.key) return;
    if (CAST_HD?.rows[this.key] !== undefined && this.scene.textures.exists('cast-hd')) {
      const anim = `${this.key}#hd-${this.moving && !this.ghost && !this.still ? 'walk' : 'idle'}-${this.dir}`;
      if (force || !this.hd || this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim, !force);
      this.hd = true;
      return;
    }
    if (this.hd) {
      this.hd = false;
      this.sprite.setRotation(0);
      this.sprite.setTexture('cast');
    }
    const anim = `${this.key}#${this.moving && !this.ghost ? 'walk' : 'idle'}-${this.dir}`;
    if (!this.scene.anims.exists(anim)) return;
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

/** Plain background townsfolk (client-only; never collide, no names, daytime only). */
interface Npc extends NpcRoamer {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  dir: Dir8;
}

// ---------------------------------------------------------------------------------------

export class TownScene extends Phaser.Scene {
  private bridge: TownBridge;
  private offs: (() => void)[] = [];
  private myPid: string | null = null;
  private gameplay: GameplayLayer | null = null;
  private social: SocialLayer | null = null;
  private chatBubbles: ChatBubbles | null = null;
  private ready = false;
  private me = { x: 0, y: 0, facing: 'down' as Facing, moving: false, location: 'outdoors' as LocationId };
  private myDir: Dir8 = 'down';
  private seq = 0;
  private fenceSeq = 0;
  private lastSentAt = 0;
  private lastSent = { x: NaN, y: NaN, moving: false, facing: 'down' as Facing };
  private myAvatar: Avatar | null = null;
  private avatars = new Map<string, Avatar>();
  private keys = new Set<string>();
  /** Tap-to-go route (outdoors) and what to do at its end. */
  private route: { pts: { x: number; y: number }[]; enter: string | null } | null = null;
  /** A tap made while inside: leave first, then go here. */
  private pendingGo: { x: number; y: number; enter: string | null } | null = null;
  private lobby: LobbyRoomView | null = null;
  private gview: PlayerGameView | StorytellerGameView | null = null;
  private phase: Phase = 'waiting';
  private lightSrcs: LightSrc[] = [];
  private lightRT!: Phaser.GameObjects.RenderTexture;
  private mask!: Phaser.GameObjects.Graphics;
  private ambient = { r: 0xd0, g: 0xc8, b: 0xdc };
  private area = { ...TOWN };
  private view = { x: 0, y: 0, init: false };
  private doors: DoorObj[] = [];
  private enterCooldownUntil = 0;
  private boards = new Map<string, { objs: Phaser.GameObjects.GameObject[]; key: string }>();
  private boarded = new Map<string, Phaser.GameObjects.GameObject>();
  private chimneys: { x: number; y: number; next: number }[] = [];
  private fx: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private fireflies: { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private npcs: Npc[] = [];
  private pigeons: { s: Phaser.GameObjects.Sprite; home: { x: number; y: number }; away: number; ph: number }[] = [];
  private doorGlows: { img: Phaser.GameObjects.Image; d: DoorObj }[] = [];
  private lastPromptKey = '';
  private clockFace: { x: number; y: number; r: number } | null = null;
  private clockDepth = 0;
  private clockGfx: Phaser.GameObjects.Graphics | null = null;
  private lastInsideKey = '';

  constructor(bridge: TownBridge) {
    super({ key: 'town' });
    this.bridge = bridge;
  }

  textRes() {
    return Math.max(1, Math.ceil(this.cameras.main.zoom * (window.devicePixelRatio || 1)));
  }
  /** Text size (world px) that renders at about `screenPx` CSS px at the current zoom. */
  fontPx(screenPx: number) {
    return Math.max(4, screenPx / Math.max(0.2, this.cameras.main.zoom));
  }

  preload() {
    this.load.image('terrain', terrainUrl);
    this.load.image('decor', decorUrl);
    this.load.image('objects', objectsUrl);
    this.load.image('cast', castUrl);
    if (CAST_HD_PNG && CAST_HD) this.load.image('cast-hd', CAST_HD_PNG);
    this.load.spritesheet('lights', lightsUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.tilemapTiledJSON('town', townJsonUrl);
    if (FX_PNG && FX_JSON) this.load.image('fx', FX_PNG);
  }

  create() {
    const conn = this.bridge.conn;
    this.cameras.main.setBackgroundColor('#09070d');
    this.cameras.main.setRoundPixels(true);
    // --- map
    const map = this.make.tilemap({ key: 'town' });
    map.createLayer('ground', map.addTilesetImage('terrain', 'terrain')!, 0, 0)!.setDepth(0);
    map.createLayer('decor', map.addTilesetImage('decor', 'decor')!, 0, 0)!.setDepth(1);
    const atlas = this.textures.get('objects');
    for (const [name, r] of Object.entries((objectsAtlas as unknown as { frames: Record<string, { x: number; y: number; w: number; h: number }> }).frames)) atlas.add(name, 0, r.x, r.y, r.w, r.h);
    this.defineCast();
    this.defineFx();
    const buildingDepth = new Map<string, number>();
    for (const o of map.getObjectLayer('objects')?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      if (type === 'light') {
        this.lightSrcs.push({ x: o.x!, y: o.y!, r: Number(prop(o, 'radius') ?? 40), color: String(prop(o, 'color') ?? 'warm'), building: (prop(o, 'building') as string) || null, facade: !!prop(o, 'facade') });
        continue;
      }
      if (type === 'door') continue; // handled below (needs the building depth)
      const frame = String(prop(o, 'frame'));
      const depth = Number(prop(o, 'depth') ?? o.y! + o.height!);
      this.add
        .image(o.x!, o.y!, 'objects', frame)
        .setOrigin(0, 0)
        .setDepth(type === 'flat' ? 2 : 10 + depth);
      if (type === 'building') {
        const id = String(prop(o, 'building') ?? '');
        const ck = prop(o, 'clock');
        if (typeof ck === 'string' && ck) {
          try {
            this.clockFace = JSON.parse(ck) as { x: number; y: number; r: number };
            this.clockDepth = 10 + depth + 0.1;
          } catch {
            // ignore malformed
          }
        }
        buildingDepth.set(id, 10 + depth);
        const ch = prop(o, 'chimney');
        if (typeof ch === 'string' && ch) {
          try {
            const c = JSON.parse(ch) as { x: number; y: number };
            this.chimneys.push({ x: c.x, y: c.y, next: 0 });
          } catch {
            // ignore malformed
          }
        }
      }
    }
    this.setupDoors(map, buildingDepth);
    // --- lighting (world-space multiply layer over the current area) + letterbox mask
    this.lightRT = this.add.renderTexture(0, 0, Math.max(TOWN.w, 400), Math.max(TOWN.h, 400)).setOrigin(0, 0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.mask = this.add.graphics().setDepth(5300);
    this.setupAmbience();
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());

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
      this.refreshBoards();
    };
    onLobby(conn.lobbyView.get());
    onGame(conn.gameView.get());
    this.offs.push(conn.lobbyView.subscribe(onLobby));
    this.offs.push(conn.gameView.subscribe(onGame));
    this.offs.push(conn.events.on('world:teleport', (t) => this.onTeleport(t)));
    this.offs.push(conn.events.on('world:snapshot', (s) => this.onSnapshot(s)));
    this.offs.push(conn.events.on('sound', (s) => playCue(s.cue as Cue)));
    this.offs.push(doorTagsStore.subscribe(() => this.refreshBoards()));
    this.chatBubbles = createChatBubbles(this.game.canvas.parentElement!, conn, {
      location: () => this.me.location,
      anchor: (pid) => {
        const a = pid === this.myPid ? this.myAvatar : this.avatars.get(pid);
        if (!this.ready || !a || !a.sprite.visible || (pid !== this.myPid && a.location !== this.me.location)) return null;
        const cam = this.cameras.main;
        // Use the drawn pose, including interpolation, sprite scale, and the name label.
        // The camera is unrotated, with its default centre origin.
        return {
          x: cam.x + cam.width / 2 + (a.sprite.x - cam.scrollX - cam.width / 2) * cam.zoom,
          y: cam.y + cam.height / 2 + (a.label.y - a.label.displayHeight - cam.scrollY - cam.height / 2) * cam.zoom - 6,
        };
      },
    });
    this.offs.push(() => {
      this.chatBubbles?.destroy();
      this.chatBubbles = null;
    });
    this.bridge.registerLeave?.(() => this.leave());
    this.offs.push(() => this.bridge.registerLeave?.(null));

    // --- input (window-level so typing in inputs is ignored)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = keyDir(e.code);
      if (k) {
        this.keys.add(k);
        this.route = null;
        this.pendingGo = null;
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
      if (e.code === 'Escape' && this.me.location !== 'outdoors' && !stagePick.get()) this.leave();
    };
    const up = (e: KeyboardEvent) => {
      const k = keyDir(e.code);
      if (k) this.keys.delete(k);
    };
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.offs.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
    // tap / click: go to a cottage (and in) or a spot; the Storyteller teleports
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));

    this.gameplay = createGameplayLayer(this, { conn, myPid: () => this.myPid, me: () => this.me, amStoryteller: () => this.amStoryteller() });
    this.offs.push(() => {
      this.gameplay?.destroy();
      this.gameplay = null;
    });
    this.social = createSocialLayer(this, {
      conn,
      myPid: () => this.myPid,
      me: () => this.me,
      amStoryteller: () => this.amStoryteller(),
      positionOf: (pid) => {
        const a = pid === this.myPid ? (this.ready ? this.myAvatar : null) : this.avatars.get(pid);
        return a && a.sprite.visible ? { x: a.sprite.x, y: a.sprite.y, scale: a.worldScale } : null;
      },
      entityAt: (x, y) => {
        let best: { pid: string; d: number } | null = null;
        for (const a of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) {
          if (!a.sprite.visible) continue;
          const dx = x - a.sprite.x;
          const dy = y - (a.sprite.y - 14 * a.worldScale);
          if (Math.abs(dx) > 14 * a.worldScale || Math.abs(dy) > 20 * a.worldScale) continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { pid: a.pid, d };
        }
        return best?.pid ?? null;
      },
      characterOf: (pid) => this.castKey(pid).key.split('/')[0]!,
      passTap: (sx, sy) => this.handleTap(sx, sy, false),
      faceToward: (x, y) => {
        if (!this.myAvatar) return;
        this.myDir = dir8(x - this.me.x, y - (this.me.y - 12));
        this.myAvatar.setPose(this.me.x, this.me.y, this.myDir, false);
      },
    });
    this.offs.push(() => {
      this.social?.destroy();
      this.social = null;
    });
    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this;
    // Test hook (production-safe, opt-in per browser): localStorage 'ct.debug.camera' = '1' exposes the
    // camera and public sign text so e2e tests can inspect the rendered town.
    let camHook = false;
    try {
      camHook = localStorage.getItem('ct.debug.camera') === '1';
    } catch {
      // storage blocked
    }
    if (camHook)
      (window as unknown as { __ctCamera?: unknown }).__ctCamera = {
        worldToScreen: (x: number, y: number) => {
          const cam = this.cameras.main;
          const r = this.game.canvas.getBoundingClientRect();
          return { x: r.left + (x - cam.worldView.x) * cam.zoom, y: r.top + (y - cam.worldView.y) * cam.zoom };
        },
        view: () => ({ ...this.cameras.main.worldView, zoom: this.cameras.main.zoom }),
        me: () => ({ ...this.me }),
        avatar: (pid: string) => {
          const a = pid === this.myPid ? this.myAvatar : this.avatars.get(pid);
          return a?.sprite.visible ? { texture: a.sprite.texture.key, frame: a.sprite.frame.name, scale: a.worldScale,
            width: a.sprite.displayWidth, height: a.sprite.displayHeight, x: a.sprite.x, y: a.sprite.y } : null;
        },
        npcs: () => this.npcs.filter((n) => n.sprite.visible).map((n) => ({ id: n.id, x: n.x, y: n.y, home: { ...n.home }, avoiding: n.avoiding })),
        doorBoards: () => Object.fromEntries([...this.boards].map(([id, board]) => [
          id,
          board.objs
            .filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text)
            .map((o) => ({ text: o.text, visible: o.visible, bounds: { ...o.getBounds() } })),
        ])),
      };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private cleanup() {
    for (const off of this.offs.splice(0)) off();
    remoteEntities.clear();
    this.bridge.setInside?.(null);
  }

  // ---------------------------------------------------------------------------------------
  // textures

  private defineCast() {
    const tex = this.textures.get('cast');
    const fw = CAST.frameWidth;
    const fh = CAST.frameHeight;
    const nf = CAST.frames.length;
    for (const [key, pos] of Object.entries(CAST.sheets)) {
      CAST.directions.forEach((dir, r) => {
        for (let f = 0; f < nf; f++) tex.add(`${key}|${dir}|${f}`, 0, pos.x + f * fw, pos.y + r * fh, fw, fh);
        const ghost = key.includes('/ghost');
        this.anims.create({ key: `${key}#walk-${dir}`, frames: [1, 2, 3, 4].map((f) => ({ key: 'cast', frame: `${key}|${dir}|${f}` })), frameRate: Math.round(CAST.walkFps * 1.25), repeat: -1 });
        this.anims.create({
          key: `${key}#idle-${dir}`,
          frames: (ghost ? [0, 1, 2, 3, 4, 3, 2, 1] : [0]).map((f) => ({ key: 'cast', frame: `${key}|${dir}|${f}` })),
          frameRate: ghost ? 5 : 1,
          repeat: -1,
        });
      });
    }
    if (CAST_HD && this.textures.exists('cast-hd')) {
      const hd = this.textures.get('cast-hd');
      // not pixel art: smooth filtering, unlike the rest of the (pixelArt: true) game
      hd.setFilter(Phaser.Textures.FilterMode.LINEAR);
      for (const [key, r] of Object.entries(CAST_HD.rows)) {
        const ghost = key.includes('/ghost');
        CAST_HD.directions.forEach((dir, c) => {
          for (let f = 0; f < (ghost ? 1 : CAST_HD.frames.length); f++)
            hd.add(`${key}|${dir}|${f}`, 0, c * CAST_HD.frameWidth, (r + f) * CAST_HD.frameHeight, CAST_HD.frameWidth, CAST_HD.frameHeight);
          for (const action of ['idle', 'walk']) this.anims.create({
            key: `${key}#hd-${action}-${dir}`,
            frames: (action === 'walk' && !ghost ? [1, 2, 3, 4] : [0]).map((f) => ({ key: 'cast-hd', frame: `${key}|${dir}|${f}` })),
            frameRate: CAST_HD.walkFps,
            repeat: -1,
          });
        });
      }
    }
  }

  private defineFx() {
    if (!FX_JSON || !this.textures.exists('fx')) return;
    const tex = this.textures.get('fx');
    for (const [name, r] of Object.entries(FX_JSON.frames)) tex.add(name, 0, r.x, r.y, r.w, r.h);
    const fps = FX_JSON.meta?.fps ?? {};
    const seq = (prefix: string) => Object.keys(FX_JSON.frames).filter((n) => new RegExp(`^${prefix}_\\d+$`).test(n)).sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
    for (const anim of ['poof', 'brazier', 'smoke', 'firefly', 'ember', 'sparkle']) {
      const frames = seq(anim);
      if (frames.length) this.anims.create({ key: `fx#${anim}`, frames: frames.map((frame) => ({ key: 'fx', frame })), frameRate: fps[anim] ?? 8, repeat: anim === 'poof' || anim === 'smoke' ? 0 : -1 });
    }
  }
  private hasFx(frame: string) {
    return !!FX_JSON?.frames[frame] && this.textures.exists('fx');
  }

  // ---------------------------------------------------------------------------------------
  // doors

  private setupDoors(map: Phaser.Tilemaps.Tilemap, buildingDepth: Map<string, number>) {
    const art = new Map<string, Phaser.Types.Tilemaps.TiledObject>();
    for (const o of map.getObjectLayer('objects')?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      if (type === 'door') art.set(String(prop(o, 'building') ?? o.name), o);
    }
    for (const b of L.buildings) {
      const at = tileCenterPx(L, b.door);
      const f = b.footprint;
      const inward = b.door.y >= f.y + f.h ? { x: 0, y: -1 } : b.door.x >= f.x + f.w ? { x: -1, y: 0 } : b.door.x < f.x ? { x: 1, y: 0 } : { x: 0, y: -1 };
      const d: DoorObj = { b, at, inward, open: 0 };
      const o = art.get(b.id);
      const leaf = o ? String(prop(o, 'leaf') ?? '') : '';
      const hole = o ? String(prop(o, 'hole') ?? '') : '';
      if (o && leaf && hole && this.textures.get('objects').has(leaf) && this.textures.get('objects').has(hole)) {
        const depth = (buildingDepth.get(b.id) ?? 10 + at.y) + 0.02;
        const hinge = String(prop(o, 'hinge') ?? 'left');
        d.hole = this.add.image(o.x!, o.y!, 'objects', hole).setOrigin(0, 0).setDepth(depth).setVisible(false);
        d.leaf = this.add
          .image(hinge === 'right' ? o.x! + o.width! : o.x!, o.y!, 'objects', leaf)
          .setOrigin(hinge === 'right' ? 1 : 0, 0)
          .setDepth(depth + 0.01)
          .setVisible(false);
      }
      this.doors.push(d);
      const g = FX_HOUSES[b.id]?.doorglow;
      if (g && this.hasFx('doorglow')) {
        const img = this.add.image(g.x, g.y, 'fx', 'doorglow').setDepth(9).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.doorGlows.push({ img, d });
      }
    }
  }

  /** Local-only door swing: doors near you open; nothing is sent, nobody else sees it. */
  private animateDoors(dt: number) {
    const outdoors = this.me.location === 'outdoors' && this.ready;
    for (const d of this.doors) {
      if (!d.leaf || !d.hole) continue;
      const near = outdoors && Math.hypot(this.me.x - d.at.x, this.me.y - d.at.y) < DOOR_OPEN_RANGE && !this.doorLocked(d.b, false) && this.houseInUse(d.b);
      const target = near ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 5);
      const vis = d.open > 0.01;
      d.hole.setVisible(vis);
      d.leaf.setVisible(vis);
      // swing: the leaf narrows toward its hinge (a cheap but readable 3/4 swing)
      d.leaf.setScale(1 - 0.78 * easeOut(d.open), 1);
    }
  }

  /** A cottage is "in use" when it has a resident (game running) — empty cottages stay boarded. */
  private houseInUse(b: BuildingDef): boolean {
    const g = this.gview;
    if (!g) return true; // waiting room: every cottage is a room
    return g.players.some((p) => p.seat === b.houseIndex);
  }

  private doorLocked(b: BuildingDef, exit: boolean): boolean {
    if (this.amStoryteller()) return false;
    const o = this.gameplay?.doorOverride(b.id);
    if (o !== null && o !== undefined) return o;
    if (!LOCKED.has(this.phase)) return false;
    const seat = this.mySeat();
    const home = seat === null ? null : L.buildings.find((x) => x.houseIndex === seat)?.id;
    return exit ? b.id === home : b.id !== home;
  }

  private lockText(b: BuildingDef, exit: boolean): string {
    if (LOCKED.has(this.phase) && this.gameplay?.doorOverride(b.id) == null) return exit ? 'You stay home until morning' : 'Locked for the night';
    return `${b.name} is locked by the Storyteller`;
  }

  private enter(b: BuildingDef) {
    const now = performance.now();
    if (now < this.enterCooldownUntil) return;
    if (this.doorLocked(b, false)) {
      this.flashPrompt(this.lockText(b, false), true);
      return;
    }
    this.enterCooldownUntil = now + 900;
    this.route = null;
    // Movement normally sends at 15Hz. Flush the feet position first so the server does not
    // evaluate entry against the previous position, still a step away from the doorstep.
    this.sendMove(now, false);
    this.bridge.conn.send('world:useDoor', { buildingId: b.id });
  }

  private leave() {
    const b = this.currentBuilding();
    if (!b || !this.ready) return;
    const now = performance.now();
    if (now < this.enterCooldownUntil) return;
    if (this.doorLocked(b, true)) {
      this.flashPrompt(this.lockText(b, true), true);
      return;
    }
    this.enterCooldownUntil = now + 600;
    this.bridge.conn.send('world:useDoor', { buildingId: b.id });
  }

  private flashPrompt(text: string, locked: boolean) {
    this.bridge.setPrompt({ key: '', text, locked });
    this.lastPromptKey = 'flash';
    this.time.delayedCall(2200, () => {
      if (this.lastPromptKey === 'flash') {
        this.lastPromptKey = '';
        this.bridge.setPrompt(null);
      }
    });
  }

  /** Walking into a doorway enters — only while pushing toward the door (brushing past does not). */
  private checkAutoEnter(vx: number, vy: number) {
    if (vx === 0 && vy === 0) return;
    const len = Math.hypot(vx, vy);
    const inside = this.currentBuilding();
    if (inside) {
      const door = tileCenterPx(L, inside.interiorDoor);
      // Interior doors are on the south wall. Walking elsewhere in the room never exits.
      if (Math.hypot(this.me.x - door.x, this.me.y - door.y) <= DOOR_TRIGGER && vy / len > 0.6) this.leave();
      return;
    }
    for (const d of this.doors) {
      if (Math.hypot(this.me.x - d.at.x, this.me.y - d.at.y) > DOOR_TRIGGER) continue;
      if ((vx * d.inward.x + vy * d.inward.y) / len < 0.6) continue;
      if (!this.houseInUse(d.b) && !this.amStoryteller()) {
        this.flashPrompt('Nobody lives here', true);
        return;
      }
      this.enter(d.b);
      return;
    }
  }

  // ---------------------------------------------------------------------------------------
  // tap / click

  private onTap(p: Phaser.Input.Pointer) {
    if (p.button !== 0) return;
    this.handleTap(p.x, p.y, true);
  }

  /** A primary tap at canvas point (sx, sy); `askSocial` = let the emote/pin layer claim it first. */
  private handleTap(sx: number, sy: number, askSocial: boolean) {
    if (!this.ready) return;
    if (stagePick.get()) return; // the Storyteller panel is picking a point
    const w = this.cameras.main.getWorldPoint(sx, sy);
    if (askSocial && this.social?.onTap(w.x, w.y)) return; // pointing / pinning
    const inside = this.currentBuilding();
    if (inside) {
      if (!this.insideArea(w.x, w.y)) return;
      const door = tileCenterPx(L, inside.interiorDoor);
      // Tap the doorway to walk there and leave; any other floor tap walks within the room.
      const atDoor = Math.abs(w.x - door.x) <= TS && w.y >= door.y - 6;
      this.goTo(atDoor ? { ...door, enter: inside.id } : { x: w.x, y: w.y, enter: null });
      return;
    }
    const target = this.tapTarget(w.x, w.y);
    if (this.amStoryteller() && this.gview?.kind === 'storyteller') {
      // Storyteller: click-to-teleport (a building = straight inside, like a visit).
      if (target.enter) this.bridge.conn.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: target.enter } });
      else if (this.me.location === 'outdoors') this.bridge.conn.send('st:command', { type: 'teleport_self', to: { kind: 'point', x: Math.round(target.x), y: Math.round(target.y) } });
      return;
    }
    this.goTo(target);
  }

  private insideArea(x: number, y: number) {
    return x >= this.area.x && y >= this.area.y && x < this.area.x + this.area.w && y < this.area.y + this.area.h;
  }

  /** What a tap at a world point means: a cottage (its sprite or doorstep) or a spot on the ground. */
  private tapTarget(x: number, y: number): { x: number; y: number; enter: string | null } {
    for (const d of this.doors) {
      const f = d.b.footprint;
      const inSprite = x >= f.x * TS && x < (f.x + f.w) * TS && y >= (f.y - 1) * TS && y < (f.y + f.h) * TS;
      if (inSprite || Math.hypot(x - d.at.x, y - d.at.y) < 14) return { x: d.at.x, y: d.at.y, enter: d.b.id };
    }
    return { x, y, enter: null };
  }

  private goTo(t: { x: number; y: number; enter: string | null }) {
    if (!this.gameplay?.wantsLocalInput()) return;
    const goal = t.enter ? t : nearestFree(L, { x: t.x, y: t.y + 6 }, 32);
    if (!goal || locationAt(L, goal.x, goal.y) !== this.me.location) return;
    const pts = findPath(L, { x: this.me.x, y: this.me.y }, goal, this.me.location);
    if (!pts) return;
    this.route = { pts, enter: t.enter };
  }

  // ---------------------------------------------------------------------------------------
  // appearances

  private castKey(pid: string): { key: string; name: string; st: boolean; lantern: boolean; ghost: boolean } {
    const m = this.lobby?.members.find((x) => x.pid === pid);
    const st = m?.role === 'storyteller' || (this.gview?.kind === 'storyteller' && pid === this.myPid);
    const name = m?.displayName ?? '…';
    if (st) return { key: 'storyteller', name, st: true, lantern: true, ghost: false };
    const picked = castById(m?.cosmetics.preset ?? null);
    let id: string;
    if (picked && (picked.kind === 'villager' || picked.kind === 'mascot')) id = picked.id;
    else {
      // Unknown / legacy: a stable stand-in until the server assigns a character.
      let h = 0;
      for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      id = PLAYABLE[h % PLAYABLE.length]!.id;
    }
    const pub = this.gview?.players.find((p) => p.pid === pid);
    const dead = pub ? !pub.alive : false;
    let key = id;
    if (dead) {
      const g = pub!.ghostVoteAvailable ? `${id}/ghost` : `${id}/ghost-spent`;
      key = CAST.sheets[g] ? g : CAST.sheets[`${id}/ghost`] ? `${id}/ghost` : id;
    }
    if (!CAST.sheets[key]) key = Object.keys(CAST.sheets)[0]!;
    return { key, name, st: false, lantern: !!castById(id)?.lantern, ghost: dead };
  }

  private refreshAppearances() {
    if (!this.sys.isActive() && !this.sys.settings.active) return;
    const apply = (a: Avatar) => {
      const k = this.castKey(a.pid);
      a.setAppearance(k.key, k.name, k);
    };
    if (this.myAvatar) apply(this.myAvatar);
    for (const a of this.avatars.values()) apply(a);
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
      const k = this.castKey(this.myPid);
      this.myAvatar.setAppearance(k.key, k.name, k);
    }
    if (this.myAvatar) {
      this.myAvatar.location = location;
      this.myAvatar.setPose(x, y, this.myDir, false);
    }
    if (!this.ready || prevLoc !== location) {
      this.ready = true;
      this.onLocationChange(prevLoc);
    }
  }

  onTeleport(t: WorldTeleport) {
    // Rejoining keeps the server's last movement sequence, even though this scene is new.
    this.seq = Math.max(this.seq, t.seq);
    if (t.reason === 'correction' && t.seq <= this.fenceSeq) return;
    this.fenceSeq = this.seq;
    this.lastSent = { x: t.x, y: t.y, moving: false, facing: this.me.facing };
    const changed = t.location !== this.me.location;
    const from = { x: this.me.x, y: this.me.y, loc: this.me.location };
    if (t.reason !== 'correction') this.route = null;
    this.placeMe(t.x, t.y, t.location);
    if (t.reason === 'door' && changed) playCue('door');
    // the Storyteller's own teleports get the poof (where you left, where you arrive)
    if (t.reason === 'storyteller' && this.amStoryteller()) {
      if (from.loc === this.me.location) this.poof(from.x, from.y);
      this.poof(t.x, t.y);
    }
  }

  onSnapshot(s: WorldSnapshot) {
    // The spawn teleport can precede scene creation; snapshots also restore the sequence.
    // Otherwise a reload's moves are discarded as stale until the counter catches up.
    this.seq = Math.max(this.seq, s.ackSeq);
    noteServerTime(s.t);
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
        const k = this.castKey(e.id);
        a.setAppearance(k.key, k.name, k);
        a.location = e.location;
        a.dir = fromFacing(e.facing);
        this.avatars.set(e.id, a);
        if (a.isST && this.ready && e.location === this.me.location) this.poof(e.x, e.y); // the Storyteller appears
      }
      if (a.location !== e.location) {
        a.samples = [];
        a.location = e.location;
      }
      const lastS = a.samples[a.samples.length - 1];
      if (lastS && a.isST && Math.hypot(lastS.x - e.x, lastS.y - e.y) > 48) {
        // a Storyteller jump (teleport): poof out, poof in, no sliding across the square
        if (a.location === this.me.location) {
          this.poof(lastS.x, lastS.y);
          this.poof(e.x, e.y);
        }
        a.samples = [];
      }
      a.samples.push({ t: now, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
      if (a.samples.length > 12) a.samples.splice(0, a.samples.length - 12);
    }
    for (const [pid, a] of this.avatars)
      if (!seen.has(pid)) {
        if (a.isST && a.location === this.me.location && a.sprite.visible) this.poof(a.sprite.x, a.sprite.y);
        a.destroy();
        this.avatars.delete(pid);
        remoteEntities.delete(pid);
      }
    this.refreshInside();
    this.chatBubbles?.update();
  }

  private poof(x: number, y: number) {
    if (this.anims.exists('fx#poof')) {
      const s = this.add.sprite(Math.round(x), Math.round(y), 'fx').setOrigin(0.5, 38 / 40).setDepth(4100);
      s.play('fx#poof');
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
      return;
    }
    // fallback: a ring of violet-gold sparks
    const g = this.add.graphics().setDepth(4100);
    const t0 = this.time.now;
    const ev = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const k = (this.time.now - t0) / 520;
        g.clear();
        if (k >= 1) {
          ev.remove();
          g.destroy();
          return;
        }
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + k * 3;
          const r = 4 + k * 14;
          g.fillStyle(i % 2 ? 0xd5b56a : 0xb48cff, 1 - k);
          g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 14 + Math.sin(a) * r * 0.7), 2, 2);
        }
      },
    });
  }

  // ---------------------------------------------------------------------------------------
  // inside a cottage

  private currentBuilding(): BuildingDef | undefined {
    if (this.me.location === 'outdoors') return undefined;
    const id = this.me.location.slice(4);
    return L.buildings.find((b) => b.id === id);
  }

  private onLocationChange(prev: LocationId) {
    this.chatBubbles?.clear();
    this.route = null;
    this.fitCamera();
    for (const b of this.boards.values()) for (const o of b.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.me.location === 'outdoors');
    for (const o of this.boarded.values()) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.me.location === 'outdoors');
    for (const n of this.npcs) n.sprite.setVisible(this.me.location === 'outdoors' && DAYLIKE.has(this.phase));
    for (const f of this.fireflies) f.img.setVisible(this.me.location === 'outdoors');
    for (const e of this.fx) e.setVisible(this.me.location === 'outdoors');
    this.refreshInside();
    this.publishLocal(true);
    // a tap made while inside: we're out now, carry on
    if (prev !== 'outdoors' && this.me.location === 'outdoors' && this.pendingGo) {
      const g = this.pendingGo;
      this.pendingGo = null;
      this.goTo(g);
    }
  }

  private occupants(): { pid: string; avatar: Avatar }[] {
    const here = this.me.location;
    const list: { pid: string; avatar: Avatar }[] = [];
    if (this.myAvatar && this.myPid) list.push({ pid: this.myPid, avatar: this.myAvatar });
    for (const [pid, a] of this.avatars) if (a.location === here) list.push({ pid, avatar: a });
    // stable order: the Storyteller last (a visit), others by pid
    return list.sort((a, b) => Number(a.avatar.isST) - Number(b.avatar.isST) || (a.pid < b.pid ? -1 : 1));
  }

  private refreshInside() {
    const b = this.currentBuilding();
    if (!b) {
      if (this.lastInsideKey !== '') {
        this.lastInsideKey = '';
        this.bridge.setInside?.(null);
      }
      return;
    }
    const others = this.occupants()
      .filter((o) => o.pid !== this.myPid)
      .map((o) => o.avatar.label.text || '…');
    const locked = this.doorLocked(b, true);
    const info: InsideInfo = { buildingId: b.id, name: this.houseTitle(b), others, canLeave: !locked, ...(locked ? { lockedReason: this.lockText(b, true) } : {}) };
    const key = JSON.stringify(info);
    if (key !== this.lastInsideKey) {
      this.lastInsideKey = key;
      this.bridge.setInside?.(info);
    }
  }

  /** "Ada's cottage" when the house has a resident, else its name. */
  private houseTitle(b: BuildingDef): string {
    const res = this.gview?.players.find((p) => p.seat === b.houseIndex);
    if (!res) return b.name;
    return res.pid === this.myPid ? 'Your home' : `${res.name}’s home`;
  }

  // ---------------------------------------------------------------------------------------
  // bulletin boards + boarded-up cottages

  private refreshBoards() {
    if (!this.sys?.isActive?.() && !this.sys?.settings?.active) return;
    const day = DAYLIKE.has(this.phase);
    const tags = doorTagsStore.get();
    const outdoors = this.me.location === 'outdoors';
    for (const d of this.doors) {
      const b = d.b;
      const inUse = this.houseInUse(b);
      // boarded door on empty cottages (public: the seat count), identical day and night
      const hasBoard = this.boarded.has(b.id);
      if (!inUse && !hasBoard) {
        this.boarded.set(b.id, this.makeBoarded(d));
      } else if (inUse && hasBoard) {
        this.boarded.get(b.id)!.destroy();
        this.boarded.delete(b.id);
      }
      const res = this.gview?.players.find((p) => p.seat === b.houseIndex) ?? null;
      const view: DoorBoardView | undefined = tags[b.id];
      const key = !day || !inUse ? '' : JSON.stringify([res?.name ?? '', view?.tags.map((t) => [t.pid, t.name, t.ghost]) ?? [], Math.round(this.cameras.main.zoom * 20)]);
      const cur = this.boards.get(b.id);
      if (cur && cur.key === key) continue;
      if (cur) for (const o of cur.objs) o.destroy();
      const objs = key ? this.makeBoard(d, res?.name ?? null, view) : [];
      for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(outdoors);
      this.boards.set(b.id, { objs, key });
    }
  }

  private makeBoarded(d: DoorObj): Phaser.GameObjects.GameObject {
    const meta = FX_HOUSES[d.b.id];
    if (meta?.boarded && this.hasFx(meta.boarded.frame)) {
      // exact planks over this cottage's door + its windows unlit (an empty house, day and night alike)
      const c = this.add.container(0, 0).setDepth(10 + (d.b.footprint.y + d.b.footprint.h) * TS + 0.05);
      if (meta.unlit && this.hasFx(meta.unlit.frame)) c.add(this.add.image(meta.unlit.wx, meta.unlit.wy, 'fx', meta.unlit.frame).setOrigin(0, 0));
      c.add(this.add.image(meta.boarded.wx, meta.boarded.wy, 'fx', meta.boarded.frame).setOrigin(0, 0));
      c.setVisible(this.me.location === 'outdoors');
      return c;
    }
    const depth = 10 + d.at.y - TS + 0.5;
    const south = d.inward.y < 0;
    const x = south ? d.at.x : d.at.x + d.inward.x * 9;
    const y = d.at.y - TS - 2;
    if (this.hasFx('boarded')) return this.add.image(Math.round(x), Math.round(y + 2), 'fx', 'boarded').setOrigin(0.5, 1).setDepth(depth).setVisible(this.me.location === 'outdoors');
    const g = this.add.graphics().setDepth(depth).setVisible(this.me.location === 'outdoors');
    g.fillStyle(0x3a2616, 1);
    for (const dy of [-16, -10, -4]) g.fillRect(Math.round(x - 7), Math.round(y + dy), 14, 3);
    g.fillStyle(0x6b4a2c, 1);
    for (const dy of [-16, -10, -4]) g.fillRect(Math.round(x - 6), Math.round(y + dy), 12, 1);
    return g;
  }

  /** The bulletin board: resident's name, and who's inside (daytime only; readable at any zoom). */
  private makeBoard(d: DoorObj, resident: string | null, view: DoorBoardView | undefined): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const south = d.inward.y < 0;
    // the board stands beside the door: right of a south door, toward the square for side doors
    const spot = FX_HOUSES[d.b.id]?.board;
    const bx = spot ? spot.x : south ? d.at.x + 13 : d.at.x - d.inward.x * 2;
    const by = spot ? spot.y : south ? d.at.y - 2 : d.at.y - 18;
    const depth = 10 + by + 1;
    const anchor = FX_JSON?.meta?.anchors?.board ?? { x: 11, y: 26 };
    const bf = FX_JSON?.frames.board;
    if (this.hasFx('board') && bf) objs.push(this.add.image(Math.round(bx), Math.round(by), 'fx', 'board').setOrigin(anchor.x / bf.w, anchor.y / bf.h).setDepth(depth));
    // Text boards show the full public roster; shown/overflow are only for portrait icons.
    const inside = view?.tags ?? [];
    const res = this.textRes();
    const fs = this.fontPx(13);
    const fsSmall = this.fontPx(12);
    if (!resident && !inside.length) return objs;
    const head = this.add
      .text(Math.round(bx), Math.round(by - (this.hasFx('board') ? 26 : 8)), resident ?? '', {
        fontFamily: LABEL_FONT,
        fontSize: `${fsSmall}px`,
        fontStyle: '700',
        color: '#efe2c0',
        stroke: '#140d1c',
        strokeThickness: Math.max(1, fsSmall / 4),
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setDepth(5150)
      .setAlpha(0.92);
    objs.push(head);
    if (inside.length) {
      const names = inside.map((t) => (t.ghost ? `👻 ${t.name}` : t.name));
      const txt = names.join('\n');
      const card = this.add
        // Hang the parchment down from the sign: growing upward clips the earlier names
        // above the viewport on the northern houses, leaving only the bottom of the list.
        .text(Math.round(bx), Math.round(head.y + 1), txt, {
          fontFamily: LABEL_FONT,
          fontSize: `${fs}px`,
          fontStyle: '700',
          color: '#2a1d16',
          backgroundColor: '#e8dcb8',
          align: 'center',
          lineSpacing: fs * 0.25,
          padding: { left: fs * 0.45, right: fs * 0.45, top: fs * 0.2, bottom: fs * 0.25 },
          resolution: res,
        })
        .setOrigin(0.5, 0)
        .setDepth(5150);
      objs.push(card);
    }
    return objs;
  }

  // ---------------------------------------------------------------------------------------
  // ambience (public phase, with local daytime reactions to visible Brianbi avatars)

  private setupAmbience() {
    // Fireflies: a handful of soft glowing dots over the grass, night only (also at bedtime/dawn).
    const glowKey = this.hasFx('firefly_0') ? null : this.makeDotTexture();
    for (let i = 0; i < 14; i++) {
      const x = TOWN.x + 24 + ((i * 97) % (TOWN.w - 48));
      const y = TOWN.y + 40 + ((i * 61) % (TOWN.h - 80));
      const img = glowKey ? this.add.image(x, y, glowKey) : this.add.image(x, y, 'fx', 'firefly_0');
      img.setDepth(4050).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.fireflies.push({ img, x, y, ph: i * 1.7, sp: 0.6 + (i % 5) * 0.12 });
    }
    // Each townsperson keeps a permanent home area, even when Brianbi shoos them away.
    const T = (x: number, y: number) => ({ x: x * TS + 8, y: y * TS + 14 });
    const homes = {
      'npc-sweeper': T(16, 12),
      'npc-vendor': T(10, 17),
      'npc-elder': T(10, 21),
      'npc-porter': T(22, 34),
    };
    // pigeons by the fountain and a cat asleep on the east bench (cosmetic, local only)
    const fountain = townMap.objects.find((o) => o.kind === 'fountain');
    if (fountain && this.hasFx('pigeon_0')) {
      if (!this.anims.exists('fx#peck')) this.anims.create({ key: 'fx#peck', frames: ['pigeon_0', 'pigeon_1', 'pigeon_2', 'pigeon_1'].map((frame) => ({ key: 'fx', frame })), frameRate: 4, repeat: -1 });
      if (this.hasFx('pigeon_fly_0') && !this.anims.exists('fx#flap')) this.anims.create({ key: 'fx#flap', frames: ['pigeon_fly_0', 'pigeon_fly_1'].map((frame) => ({ key: 'fx', frame })), frameRate: 10, repeat: -1 });
      [[-10, 20], [6, 24], [30, 18]].forEach(([dx, dy], i) => {
        const home = { x: fountain.x * TS + dx!, y: fountain.y * TS + dy! };
        const s = this.add.sprite(home.x, home.y, 'fx', 'pigeon_0').setDepth(10 + home.y);
        s.play({ key: 'fx#peck', startFrame: i % 3 });
        this.pigeons.push({ s, home, away: 0, ph: i * 2.1 });
      });
    }
    if (this.hasFx('cat_sleep')) {
      const bench = townMap.objects.filter((o) => o.kind === 'bench').sort((a, b) => b.x - a.x)[0];
      if (bench) this.add.image(bench.x * TS + 22, bench.y * TS + 6, 'fx', 'cat_sleep').setOrigin(0.5, 1).setDepth(10 + bench.y * TS + 17);
    }
    for (const [id, home] of Object.entries(homes)) {
      if (!CAST.sheets[id]) continue;
      const p = nearestFree(L, home, 40, (x, y) => locationAt(L, x, y) === 'outdoors');
      if (!p) continue;
      const sprite = this.add.sprite(p.x, p.y, 'cast').setOrigin(CAST.anchor.x / CAST.frameWidth, CAST.anchor.y / CAST.frameHeight).setAlpha(0.96);
      this.npcs.push({ id, sprite, ...createNpcRoamer(p, this.npcs.length), dir: 'down' });
    }
  }

  private makeDotTexture(): string {
    const key = 'ct-dot';
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xf4f0a0, 0.35).fillCircle(4, 4, 4);
      g.fillStyle(0xfffbd0, 1).fillRect(3, 3, 2, 2);
      g.generateTexture(key, 8, 8);
      g.destroy();
    }
    return key;
  }

  private stepAmbience(dt: number, now: number) {
    const outdoors = this.me.location === 'outdoors';
    const dark = NIGHT.has(this.phase) || this.phase === 'bedtime' || this.phase === 'dawn';
    const t = now / 1000;
    for (const f of this.fireflies) {
      const a = dark && outdoors ? Math.max(0, Math.sin(t * f.sp + f.ph)) * 0.9 : 0;
      f.img.setAlpha(a);
      if (a > 0) f.img.setPosition(Math.round(f.x + Math.sin(t * 0.5 + f.ph) * 10), Math.round(f.y + Math.cos(t * 0.37 + f.ph * 2) * 6));
    }
    // chimney smoke (always, gently; more visible at dusk)
    if (outdoors) {
      for (const c of this.chimneys) {
        if (now < c.next) continue;
        c.next = now + 900 + ((c.x * 37 + c.y * 11) % 700);
        this.puff(c.x, c.y);
      }
    }
    // door glows: every lived-in cottage alike (no occupancy), warmer at dusk and night
    const glowK = NIGHT.has(this.phase) ? 0.55 : this.phase === 'bedtime' || this.phase === 'dawn' ? 0.45 : 0.12;
    for (const g of this.doorGlows) g.img.setAlpha(outdoors && this.houseInUse(g.d.b) ? glowK * (0.9 + 0.1 * Math.sin(t * 2 + g.d.at.x)) : 0);
    // pigeons: peck by day, scatter when you walk up, drift back later
    for (const p of this.pigeons) {
      const near = this.ready && outdoors && Math.hypot(this.me.x - p.home.x, this.me.y - p.home.y) < 34;
      if (near && !p.away && this.anims.exists('fx#flap')) {
        p.away = now + 9000;
        p.s.play('fx#flap');
        this.tweens.add({ targets: p.s, x: p.home.x + (p.home.x % 2 ? 120 : -120), y: p.home.y - 140, alpha: 0, duration: 1400 });
      } else if (p.away && now > p.away && !near) {
        p.away = 0;
        p.s.setPosition(p.home.x, p.home.y).setAlpha(1);
        p.s.play('fx#peck');
      }
      p.s.setVisible(outdoors && DAYLIKE.has(this.phase));
    }
    // Reactions use only avatars already visible outdoors. Hidden/night/indoor players
    // cannot move an NPC or reveal their presence through this cosmetic behavior.
    const day = DAYLIKE.has(this.phase);
    const brianbis = day && outdoors && this.ready
      ? [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]
        .filter((a) => a.key === 'brianbi' && a.sprite.visible && a.location === 'outdoors')
        .map((a) => ({ x: a.sprite.x, y: a.sprite.y })) : [];
    for (const n of this.npcs) {
      n.sprite.setVisible(day && outdoors);
      if (!day) continue;
      const delta = stepNpcRoamer(n, dt, now, brianbis, (from, to) => locationAt(L, to.x, to.y) === 'outdoors' && segmentClear(L, from.x, from.y, to.x, to.y));
      const moving = Math.hypot(delta.x, delta.y) > 0.01;
      if (moving) n.dir = dir8(delta.x, delta.y);
      n.sprite.setPosition(Math.round(n.x), Math.round(n.y)).setDepth(10 + n.y);
      const anim = `${n.id}#${moving ? 'walk' : 'idle'}-${moving ? n.dir : n.dir === 'up' ? 'down' : n.dir}`;
      if (this.anims.exists(anim) && n.sprite.anims.currentAnim?.key !== anim) n.sprite.play(anim, true);
    }
  }

  private puff(x: number, y: number) {
    if (this.anims.exists('fx#smoke')) {
      const s = this.add.sprite(x, y, 'fx').setDepth(4060).setAlpha(0.75);
      s.play('fx#smoke');
      this.tweens.add({ targets: s, y: y - 18, x: x + 4, duration: 1600, onComplete: () => s.destroy() });
      return;
    }
    const s = this.add.image(x, y, this.makeSmokeTexture()).setDepth(4060).setAlpha(0.5);
    this.tweens.add({ targets: s, y: y - 18, x: x + 5, alpha: 0, scale: 1.8, duration: 1800, onComplete: () => s.destroy() });
  }
  private makeSmokeTexture(): string {
    const key = 'ct-smoke';
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xb8acc4, 0.55).fillCircle(4, 4, 4);
      g.fillStyle(0xd8d0e0, 0.5).fillCircle(3, 3, 2);
      g.generateTexture(key, 8, 8);
      g.destroy();
    }
    return key;
  }

  // ---------------------------------------------------------------------------------------
  // phase presentation

  private onPhaseChange(prev: Phase, next: Phase) {
    this.chatBubbles?.clear();
    const cam = this.cameras.main;
    const st = this.amStoryteller();
    if (NIGHT.has(next) && !NIGHT.has(prev)) {
      this.bridge.setCaption(st ? 'Night falls. Click a cottage to visit it.' : 'Night falls. You are alone in your home…');
      if (!st) {
        cam.fadeOut(650, 4, 2, 10);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => cam.fadeIn(1600, 4, 2, 10));
      }
      this.time.delayedCall(4200, () => this.bridge.setCaption(null));
    } else if (next === 'bedtime') {
      this.bridge.setCaption('The bell tolls. Walk home before dark — tap your cottage.');
      this.time.delayedCall(4200, () => this.bridge.setCaption(null));
    } else if (next === 'dawn' && NIGHT.has(prev)) {
      this.bridge.setCaption('Dawn breaks over Hollowmere.');
      if (!st) cam.flash(900, 70, 40, 50);
      this.time.delayedCall(3500, () => this.bridge.setCaption(null));
    }
    for (const n of this.npcs) n.sprite.setVisible(DAYLIKE.has(next) && this.me.location === 'outdoors');
    this.refreshInside();
  }

  // ---------------------------------------------------------------------------------------
  // camera: the whole town (or the room you're in) fitted to the screen

  private fitCamera() {
    const cam = this.cameras.main;
    const b = this.currentBuilding();
    const a = b ? { x: (b.interior.x - 0.5) * TS, y: (b.interior.y - 0.5) * TS, w: (b.interior.w + 1) * TS, h: (b.interior.h + 1) * TS } : { ...TOWN };
    this.area = a;
    const w = this.scale.width;
    const h = this.scale.height;
    if (b) {
      // inside: the whole room, cosy, not huge — above the "Inside … with …" panel at the bottom
      const reserve = h < 520 ? 92 : 132;
      const zoom = Math.min(Math.min(w / a.w, (h - reserve - 8) / a.h) * 0.94, 7);
      cam.setZoom(zoom);
      cam.centerOn(a.x + a.w / 2, a.y + a.h / 2 + reserve / 2 / zoom);
    } else {
      // outdoors: the zoom of the square's preset view (whole circle + the clock tower's face)
      cam.setZoom(Math.max(0.2, Math.min(w / SQUARE_VIEW.w, h / SQUARE_VIEW.h)));
      this.view.init = false;
      this.updateCamera(0);
    }
    // letterbox + isolation: everything outside the current area is black
    this.mask.clear();
    const big = 6000;
    this.mask.fillStyle(0x09070d, 1);
    this.mask.fillRect(a.x - big, a.y - big, a.w + big * 2, big);
    this.mask.fillRect(a.x - big, a.y + a.h, a.w + big * 2, big);
    this.mask.fillRect(a.x - big, a.y, big, a.h);
    this.mask.fillRect(a.x + a.w, a.y, big, a.h);
    this.lightRT.setPosition(a.x, a.y);
    const res = this.textRes();
    for (const av of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) {
      av.label.setResolution(res);
      av.label.setFontSize(this.fontPx(10.5));
      av.label.setStroke('#0b0812', Math.max(1.5, this.fontPx(10.5) / 4));
    }
    this.refreshBoards();
  }

  // ---------------------------------------------------------------------------------------
  // per-frame

  override update(time: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    if (this.ready && this.myAvatar) this.stepLocal(dt, time);
    this.stepRemotes();
    this.gameplay?.update(dt);
    this.social?.update(dt);
    this.animateDoors(dt);
    this.stepAmbience(dt, time);
    this.updateCamera(dt);
    this.chatBubbles?.update();
    this.drawTownClock();
    this.updateLighting(dt);
    this.updatePrompt();
  }

  /**
   * The clock tower's dial shows the town clock (public): a gold wedge = time left of the current
   * stage, the minute hand at its edge; paused = dim with two bars; no clock = hands at five to midnight.
   */
  private drawTownClock() {
    const f = this.clockFace;
    if (!f) return;
    if (!this.clockGfx) this.clockGfx = this.add.graphics().setDepth(this.clockDepth);
    const g = this.clockGfx;
    g.clear();
    if (this.me.location !== 'outdoors') return;
    const c = this.gview?.clock ?? null;
    const top = -Math.PI / 2;
    const hand = (ang: number, len: number, w: number, col: number) => {
      g.lineStyle(w, col, 1);
      g.lineBetween(f.x, f.y, f.x + Math.cos(ang) * len, f.y + Math.sin(ang) * len);
    };
    if (!c || (c.endsAt === null && c.remainingMs === null)) {
      hand(top - Math.PI / 6, f.r * 0.82, 1, 0x120e16);
      hand(top - Math.PI / 72, f.r * 0.55, 2, 0x120e16);
    } else {
      const left = Math.max(0, c.paused ? (c.remainingMs ?? 0) : (c.endsAt ?? 0) - serverNow());
      const frac = c.totalMs > 0 ? Math.min(1, left / c.totalMs) : 0;
      const end = top + frac * Math.PI * 2;
      const col = c.stage === 'nominations' ? 0xc0413b : c.stage === 'bedtime' ? 0x6f7fd0 : 0xd5b56a;
      if (frac > 0.002) {
        g.fillStyle(col, c.paused ? 0.28 : 0.5);
        g.slice(f.x, f.y, f.r * 0.86, top, end, false);
        g.fillPath();
      }
      hand(end, f.r * 0.86, 1, 0x120e16);
      if (c.paused) {
        g.fillStyle(0x120e16, 0.9);
        g.fillRect(f.x - 3, f.y - 3, 2, 6);
        g.fillRect(f.x + 1, f.y - 3, 2, 6);
      }
    }
    g.fillStyle(0xe0c060, 1);
    g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 2, 2);
  }

  /** Outdoors: rest on the square while you're in it, follow you near the edge; clamped to the town. */
  private updateCamera(dt: number) {
    if (this.currentBuilding()) return;
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    // in the square: snap to the preset view (circle + clock); near the edge: follow
    let tx = SQUARE_VIEW.x + SQUARE_VIEW.w / 2;
    let ty = SQUARE_VIEW.y + SQUARE_VIEW.h / 2;
    if (this.ready) {
      const inSquare = Math.hypot((this.me.x - PLAZA.cx) / PLAZA.rx, (this.me.y - 8 - PLAZA.cy) / PLAZA.ry) <= 1.08;
      if (!inSquare) {
        // lean toward the player just enough to keep them comfortably on screen
        const lean = 0.85;
        tx = tx + (this.me.x - tx) * lean;
        ty = ty + (this.me.y - 10 - ty) * lean;
      }
    }
    const clamp = (c: number, lo: number, size: number, view: number) => (size <= view ? lo + size / 2 : Phaser.Math.Clamp(c, lo + view / 2, lo + size - view / 2));
    tx = clamp(tx, TOWN.x, TOWN.w, vw);
    ty = clamp(ty, TOWN.y, TOWN.h, vh);
    if (!this.view.init || dt === 0) {
      this.view = { x: tx, y: ty, init: true };
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.view.x += (tx - this.view.x) * k;
      this.view.y += (ty - this.view.y) * k;
    }
    cam.centerOn(Math.round(this.view.x * cam.zoom) / cam.zoom, Math.round(this.view.y * cam.zoom) / cam.zoom);
  }

  private stepLocal(dt: number, now: number) {
    const d = this.gameplay?.drive(dt) ?? null;
    if (d) {
      this.me.x = d.x;
      this.me.y = d.y;
      this.me.facing = d.facing;
      this.me.moving = d.moving;
      if (d.moving) this.myDir = fromFacing(d.facing);
      this.myAvatar!.setPose(d.x, d.y, this.myDir, d.moving);
      this.lastSent = { x: d.x, y: d.y, moving: false, facing: d.facing };
      this.route = null;
      this.publishLocal(false);
      return;
    }
    let vx = 0;
    let vy = 0;
    if (this.keys.has('left')) vx -= 1;
    if (this.keys.has('right')) vx += 1;
    if (this.keys.has('up')) vy -= 1;
    if (this.keys.has('down')) vy += 1;
    let following = false;
    if (vx === 0 && vy === 0 && this.route) {
      const next = this.route.pts[0];
      if (!next && (!this.route.enter || now >= this.enterCooldownUntil)) {
        const enter = this.route.enter;
        this.route = null;
        if (enter) {
          const d0 = this.doors.find((x) => x.b.id === enter);
          if (d0) {
            if (this.me.location === `bld:${enter}`) this.leave();
            else {
              this.myDir = dir8(d0.inward.x, d0.inward.y);
              this.enter(d0.b);
            }
          }
        }
      } else if (next) {
        const dx = next.x - this.me.x;
        const dy = next.y - this.me.y;
        const dd = Math.hypot(dx, dy);
        if (dd < 2) this.route.pts.shift();
        else {
          vx = dx / dd;
          vy = dy / dd;
          following = true;
        }
      }
    }
    const len = Math.hypot(vx, vy);
    let moving = false;
    if (len > 0) {
      vx /= len;
      vy /= len;
      const mult = this.amStoryteller() && this.gview?.kind === 'storyteller' ? Math.min(STORYTELLER_MAX_SPEED_MULT, Math.max(1, this.gview.travelSpeedMult)) : 1;
      let step = PLAYER_SPEED * mult * dt;
      if (following) {
        const next = this.route?.pts[0];
        if (next) step = Math.min(step, Math.hypot(next.x - this.me.x, next.y - this.me.y));
      }
      const nx = this.me.x + vx * step;
      const ny = this.me.y + vy * step;
      const x0 = this.me.x;
      const y0 = this.me.y;
      if (!isBlockedPx(L, nx, this.me.y) && locationAt(L, nx, this.me.y) === this.me.location) this.me.x = nx;
      if (!isBlockedPx(L, this.me.x, ny) && locationAt(L, this.me.x, ny) === this.me.location) this.me.y = ny;
      this.myDir = dir8(vx, vy);
      this.me.facing = toFacing(this.myDir, vx, vy);
      moving = Math.hypot(this.me.x - x0, this.me.y - y0) > 0.01;
      if (following && !moving) this.route = null; // blocked: give up quietly
      if (!following) this.checkAutoEnter(vx, vy);
    }
    this.me.moving = moving;
    this.myAvatar!.setPose(this.me.x, this.me.y, this.myDir, moving);
    const changed = Math.abs(this.me.x - this.lastSent.x) > 0.05 || Math.abs(this.me.y - this.lastSent.y) > 0.05 || moving !== this.lastSent.moving || this.me.facing !== this.lastSent.facing;
    if (changed && now - this.lastSentAt >= 1000 / MOVE_HZ) {
      this.sendMove(now, moving);
    }
    this.publishLocal(false);
  }

  private sendMove(now: number, moving: boolean) {
    this.seq++;
    const x = Math.round(this.me.x * 100) / 100;
    const y = Math.round(this.me.y * 100) / 100;
    this.bridge.conn.send('move', { seq: this.seq, x, y, facing: this.me.facing, moving });
    this.lastSent = { x: this.me.x, y: this.me.y, moving, facing: this.me.facing };
    this.lastSentAt = now;
  }

  private lastLocalPublish = { x: NaN, y: NaN, loc: '' };
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
      const stale = performance.now() - s[s.length - 1]!.t > 600;
      const moving = ref.moving && !stale;
      let d = a.dir;
      const mx = x - a.last.x;
      const my = y - a.last.y;
      if (moving && Math.hypot(mx, my) > 0.25) d = dir8(mx, my);
      else if (!moving && (d === 'left' || d === 'right' || d === 'up' || d === 'down') && d !== ref.facing) d = fromFacing(ref.facing);
      a.setPose(x, y, d, moving);
      a.setVisible(a.location === this.me.location);
      remoteEntities.set(a.pid, { x, y, location: a.location });
    }
  }

  private updatePrompt() {
    if (this.lastPromptKey === 'flash') return;
    let text: string | null = null;
    let locked = false;
    if (this.ready && this.me.location === 'outdoors' && !this.route) {
      for (const d of this.doors) {
        if (Math.hypot(this.me.x - d.at.x, this.me.y - d.at.y) > 20) continue;
        if (!this.houseInUse(d.b) && !this.amStoryteller()) {
          text = 'Nobody lives here';
          locked = true;
        } else if (this.doorLocked(d.b, false)) {
          text = this.lockText(d.b, false);
          locked = true;
        } else text = `Walk in: ${this.houseTitle(d.b)}`;
        break;
      }
    }
    const key = text ? `${text}|${locked}` : '';
    if (key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    this.bridge.setPrompt(text ? { key: '', text, locked } : null);
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
    const a = this.area;
    rt.clear();
    rt.fill(amb, 1);
    const night = NIGHT.has(this.phase);
    const dusk = this.phase === 'bedtime' || this.phase === 'dawn';
    const lampK = night ? 1 : dusk ? 0.8 : 0.28;
    // Windows glow at night identically for every cottage (nothing about who is home).
    const facadeK = night ? 0.95 : dusk ? 0.6 : 0;
    const here = inside ? this.me.location.slice(4) : null;
    const stamp = (x: number, y: number, r: number, color: number, alpha: number, soft = 0) => {
      if (alpha <= 0.01) return;
      if (x + r < a.x || y + r < a.y || x - r > a.x + a.w || y - r > a.y + a.h) return;
      rt.stamp('lights', soft, x - a.x, y - a.y, { scale: (r * 2) / 128, tint: color, alpha, blendMode: Phaser.BlendModes.ADD });
    };
    const flicker = (x: number) => 0.92 + 0.08 * Math.sin(this.time.now / 130 + x * 0.37) * Math.sin(this.time.now / 370 + x);
    // empty cottages (no resident — public) keep their windows dark
    const dark: { x: number; y: number; w: number; h: number }[] = [];
    if (!inside && this.gview)
      for (const d of this.doors) {
        const u = FX_HOUSES[d.b.id]?.unlit;
        if (u && !this.houseInUse(d.b)) dark.push({ x: u.wx - 2, y: u.wy - 2, w: u.w + 4, h: u.h + 4 });
      }
    const unlit = (x: number, y: number) => dark.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
    for (const l of this.lightSrcs) {
      if (l.building !== here) continue;
      if (l.facade && dark.length && unlit(l.x, l.y)) continue;
      const tint = LIGHT_TINT[l.color] ?? LIGHT_TINT.warm!;
      if (inside) stamp(l.x, l.y, l.r * 1.3, tint, (l.color === 'fire' ? 0.85 : 0.6) * flicker(l.x), 1);
      else if (l.facade) stamp(l.x, l.y, l.r, tint, facadeK * 0.7 * flicker(l.y));
      else stamp(l.x, l.y, l.r * 0.85, tint, lampK * 0.8 * flicker(l.x + l.y), 0);
    }
    const dim = night || dusk;
    const carried = (av: Avatar, x: number, y: number) => {
      if (av.isST) stamp(x, y - 14, av === this.myAvatar && night ? 104 : 70, LIGHT_TINT.st!, dim ? 0.95 : 0.25, 0);
      else if (av.hasLantern) stamp(x, y - 12, 46, LIGHT_TINT.lantern!, dim ? 0.75 : 0.15, 1);
      else if (av.ghost) stamp(x, y - 14, 30, 0x9ad0e0, dim ? 0.45 : 0.15, 1);
    };
    for (const av of this.avatars.values()) if (av.sprite.visible) carried(av, av.sprite.x, av.sprite.y);
    if (this.myAvatar && this.ready) {
      carried(this.myAvatar, this.myAvatar.sprite.x, this.myAvatar.sprite.y);
      if (dim && !this.myAvatar.isST && !inside) stamp(this.me.x, this.me.y - 12, 44, 0x9aa4d8, 0.35, 1);
    }
  }
}

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
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
void townMap;
