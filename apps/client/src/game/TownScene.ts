// The Phaser town (v2: the whole town is ONE SCREEN). Tilemap + y-sorted objects from the
// generated v1-style pixel art, 8-direction cast sprites, client prediction against the shared
// collision helpers, server reconciliation, interpolation of remote entities, day/night lighting.
//
//   camera     zoomed so the whole town square always fits on screen (everyone in the square sees
//              everyone else in it) but never the whole town: it rests on the square while you're
//              in it and follows you toward the cottages at the edge. Inside a cottage it shows that
//              cottage's whole room instead; you walk around in it like outdoors (interior.ts)
//   doors      automatic: walking INTO a doorway enters (only when you push toward the door);
//              doors swing open as you approach (local animation only, nobody else sees it);
//              inside, walking down through the doorway (or tapping it) or the Leave button walks you out
//   tap-to-go  tap/click a cottage to walk to its door and go in, or a spot to walk there;
//              the Storyteller's click teleports instead (with a poof)
//   boards     a bulletin board by each door: who is inside as character tokens, DAYTIME ONLY
//              (gameplay/boardTokens.ts); the owner's name floats over the house (gameplay/houseNames.ts)
//              (from the server's public door tags); at night every cottage looks the same
//   ambience   chimney smoke, flickering lamps, fireflies, a few plain townsfolk by day —
//              all derived from time + the PUBLIC phase only (never from other entities)
//   worlds     (v3 WP5b) the lobby's world picks the town: 'v2' = the classic map (generated/town.json),
//              'v3' = Hollowmere as Classic draws it (generated/town-v3.json + terrain-v3 / objects-v3 /
//              square-props-v3, packages/assets/scripts/v3/). Every layout-derived value (L, TS, TOWN,
//              PLAZA, SQUARE_VIEW, FX_HOUSES, NPC homes) is per scene instance, set in init() from
//              currentLayout(): one page can leave a v2 lobby and join a v3 lobby.
import * as Phaser from 'phaser';
import { PLAZA as PLAZA_V2 } from '@ct/assets';
import objectsAtlas from '@ct/assets/generated/objects.json';
import castJson from '@ct/assets/generated/cast.json';
import { castGhostsUrl, castHdUrl, castUrl, decorUrl, lightsUrl, objectsUrl, squarePropsUrl, terrainUrl, townJsonUrl } from '@ct/assets/runtime';
import { objectsV3JsonUrl, objectsV3Url, squarePropsV3JsonUrl, terrainV3Url, townV3JsonUrl } from '@ct/assets/runtime-v3';
import {
  locationAt,
  tileCenterPx,
  type BuildingDef,
  type Facing,
  type GamePhase,
  type LobbyRoomView,
  type LocationId,
  type PlayerGameView,
  type StorytellerGameView,
  type TilePoint,
  type TownLayout,
  type WorldId,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import { currentLayout, currentWorld } from '../net/layout';
import { localPlayer, remoteEntities } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { playCue, type Cue } from './audio';
import { createGameplayLayer, doorTagsStore, stagePick, type DoorBoardView, type GameplayLayer } from './gameplay';
import { findPath, nearestFree, segmentClear } from './path';
import { createNpcRoamer, stepNpcRoamer, type NpcPoint, type NpcRoamer } from './npcRoaming';
import { ExitGate, insideReserveCss, interiorRoute, interiorTapTarget, pushesOut, roomArea, touchUi } from './interior';
import { createSocialLayer, type SocialLayer } from './social';
import { createSpeechLayer, type SpeechLayer } from './social/bubbles';
import { noteServerTime, serverNow } from '../net/serverTime';
import { LOW_TIER_AMBIENCE, TierState } from './fx/tier';
import { reducedMotion } from './fx/motion';
import { fillSliceFan } from './render/fan';
import { createTalkingLayer, type TalkingLayer } from './fx/talking';
import { createBoardTokenLayer, type BoardTokenLayer } from './gameplay/boardTokens';
import { createHouseNameLayer, houseOwners, type HouseLabelInput, type HouseNameLayer } from './gameplay/houseNames';
// (v3 WP0) renderer-free rules shared with the 3D town (game3d/)
import { dir8, fromFacing, isTyping, keyDir, keyVector, toFacing, type Dir8 } from './rules/input';
import { autoEnterDoor, doorInward, doorLocked as doorLockedRule, doorPrompt, DOOR_OPEN_RANGE, houseInUse as houseInUseRule, lockText as lockTextRule, tapTarget as tapTargetRule, type DoorRuleCtx } from './rules/doors';
import { castIdentity } from './rules/cast';
import { integrateStep, interpolate, INTERP_DELAY_MS, LOCAL_PUBLISH_MS, MOVE_HZ, moveSpeed, poseChanged, pushSample, remoteDir, REMOTE_STALE_MS, routeStep, ST_JUMP_PX, wirePx, type Sample } from './rules/movement';

// (v3 WP5b) L / TS / TOWN / PLAZA / SQUARE_VIEW / FX_HOUSES are TownScene fields (the lobby's world).
// MOVE_HZ, INTERP_DELAY_MS, the door trigger distances and DOOR_OPEN_RANGE live in ./rules (v3 WP0).
type Plaza = { cx: number; cy: number; rx: number; ry: number };
/** The square's preset view (world px): the whole circle plus the clock tower's face above it. */
const squareViewOf = (p: Plaza) => ({ x: p.cx - 200, y: 56, w: 400, h: p.cy + p.ry + 18 - 56 });
/**
 * The v2 square view (TownGame sizes its canvas before a scene exists). The v3 plaza equals the v2 PLAZA, so the same view
 * holds in a v3 lobby; packages/assets/test/classicV3.test.ts fails if a re-publish moves it (then pass the lobby's view in).
 */
const SQUARE_VIEW_V2 = squareViewOf(PLAZA_V2);
/** Townsfolk home tiles of the v2 town (a v3 map carries its own: town-v3.json `npcHomes`). */
/** (v3) Townsfolk keep out of the plaza ellipse scaled by this (the voting circle and its rim). */
export const NPC_PLAZA_CLEAR = 1.1;
const NPC_HOMES_V2: Record<string, TilePoint> = { 'npc-sweeper': { x: 16, y: 12 }, 'npc-vendor': { x: 10, y: 17 }, 'npc-elder': { x: 10, y: 21 }, 'npc-porter': { x: 22, y: 34 } };
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
  /** (v2.4) ghost variants in cast-ghosts.*: one cell per direction, frame f = rowOffset[f] rows down. */
  ghosts?: { cellHeight: number; rowOffset: readonly number[]; sheets: Record<string, { x: number; y: number }> };
}
const CAST = castJson as unknown as CastManifest;
/** A sheet key the cast art has (living in cast.*, ghost variants in cast-ghosts.*). */
const hasCastSheet = (key: string): boolean => !!CAST.sheets[key] || !!CAST.ghosts?.sheets[key];
// Photo-real cast members (CastMember.hd, e.g. brianbi) also have authored full-resolution walking
// frames in generated/cast-hd.* (WebP/PNG via @ct/assets/runtime), drawn with smooth filtering and
// scaled down to the 32x40 world size; cast.png carries a downscale for everything else.
interface CastHdManifest {
  scale: number;
  directions: readonly Dir8[];
  frameWidth: number;
  frameHeight: number;
  rows: Record<string, number>;
  frames: readonly string[];
  walkFps: number;
}
const CAST_HD = Object.values(import.meta.glob('../../../../packages/assets/generated/cast-hd.json', { eager: true, import: 'default' }) as Record<string, CastHdManifest>)[0];
// Dir8 / dir8 / toFacing / fromFacing: ./rules/input (v3 WP0).

// ---------------------------------------------------------------------------------------
// Square props / ambient FX (generated/square-props.*, drawn by the fx art agent). Optional:
// everything degrades to simple shapes while the sheet does not exist yet.

const FX_PNG: string | undefined = squarePropsUrl;
const FX_JSON = Object.values(import.meta.glob('../../../../packages/assets/generated/square-props.json', { eager: true, import: 'default' }) as Record<string, unknown>)[0] as
  | {
      frames: Record<string, { x: number; y: number; w: number; h: number }>;
      meta?: {
        boardParchment?: { x: number; y: number; w: number; h: number };
        fps?: Record<string, number>;
        anchors?: Record<string, { x: number; y: number }>;
        /** Per cottage: exact overlays for an empty house + world points for board / door glow / smoke. */
        houses?: Record<string, HouseFx>;
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
  /** (v3) texture of the frame when not the square-props sheet ('fx'): 'objects-v3'. */
  atlas?: string;
}
type HouseFx = { boarded?: Ov; unlit?: Ov; doorglow?: { x: number; y: number }; board?: { x: number; y: number }; smoke?: { x: number; y: number } };
/** The v2 town's per-cottage overlays (a v3 lobby loads square-props-v3.json instead). */
const FX_HOUSES_V2: Record<string, HouseFx> = FX_JSON?.meta?.houses ?? {};

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
/** Lamp / window / hearth flicker is stepped at 12 Hz (the light layer is re-stamped only on change). */
const FLICKER_MS = 1000 / 12;

interface LightSrc {
  x: number;
  y: number;
  r: number;
  color: string;
  building: string | null;
  facade: boolean;
}
/** A fixed light of the current area, pre-filtered and pre-computed (see TownScene.rebuildLights). */
interface AreaLight {
  /** Stamp position, relative to the light layer (= the area's top-left). */
  x: number;
  y: number;
  scale: number;
  tint: number;
  frame: number;
  /** 0 = inside a cottage, 1 = window (facade), 2 = outdoor lamp. */
  mode: 0 | 1 | 2;
  /** Constant alpha factor (before the phase factor and the flicker). */
  k: number;
  /** Flicker phase seed. */
  seed: number;
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
  /** Label colour / style currently drawn (each Text change is a canvas redraw + texture upload). */
  private labelColor = '#efe6cf';
  private labelStyle = '';
  constructor(
    readonly scene: TownScene,
    readonly pid: string,
    x: number,
    y: number,
  ) {
    this.sprite = scene.add.sprite(x, y, 'cast').setOrigin(CAST.anchor.x / CAST.frameWidth, CAST.anchor.y / CAST.frameHeight);
    this.label = scene.add
      .text(x, y, '', { fontFamily: LABEL_FONT, fontSize: '8px', fontStyle: '700', color: '#efe6cf', stroke: '#0b0812', strokeThickness: 2, resolution: scene.textRes() })
      .setOrigin(0.5, 1)
      .setDepth(5200);
  }
  setAppearance(key: string, name: string, opts: { st: boolean; lantern: boolean; ghost: boolean }) {
    this.isST = opts.st;
    this.hasLantern = opts.lantern && !opts.ghost;
    this.ghost = opts.ghost;
    if (this.label.text !== name) this.label.setText(name);
    const color = this.isST ? '#e8c76a' : opts.ghost ? '#cfe6ee' : '#efe6cf';
    if (color !== this.labelColor) {
      this.labelColor = color;
      this.label.setColor(color);
    }
    if (key !== this.key) {
      this.key = key;
      this.play(true);
    }
  }
  /** Label size for the current zoom: one redraw, and none when nothing changed. */
  setLabelStyle(resolution: number, fontPx: number, strokeThickness: number) {
    const k = `${resolution}|${fontPx}|${strokeThickness}`;
    if (k === this.labelStyle) return;
    this.labelStyle = k;
    this.label.setStyle({ resolution, fontSize: `${fontPx}px`, stroke: '#0b0812', strokeThickness });
  }
  setPose(x: number, y: number, dir: Dir8, moving: boolean) {
    if (this.hd) {
      // smooth art: sub-pixel positions; HD ghosts hover gently (still under reduced motion)
      const still = reducedMotion();
      if (still !== this.still) {
        this.still = still;
        this.play();
      }
      this.sprite.setPosition(x, y + (this.ghost ? -3 - (still ? 0 : Math.sin((this.scene.time.now / 1000) * 2.2)) : 0));
    } else this.sprite.setPosition(Math.round(x), Math.round(y));
    // setDepth always queues a full display-list depth sort, even for the same value
    const depth = 10 + y;
    if (this.sprite.depth !== depth) this.sprite.setDepth(depth);
    this.label.setPosition(Math.round(x), Math.round(y) - (CAST.anchor.y - 4) + (this.ghost ? -4 : 0));
    this.last.x = x;
    this.last.y = y;
    if (dir !== this.dir || moving !== this.moving) {
      this.dir = dir;
      this.moving = moving;
      this.play();
    }
  }
  play(force = false) {
    if (!this.key) return;
    // (v2.4 perf P2) the HD sheet loads on demand: the regular cast frames stand in until it is there
    if (CAST_HD?.rows[this.key] !== undefined && !this.scene.textures.exists('cast-hd')) this.scene.wantCastHd();
    if (CAST_HD?.rows[this.key] !== undefined && this.scene.textures.exists('cast-hd')) {
      const anim = `${this.key}#hd-${this.moving && !this.ghost && !this.still ? 'walk' : 'idle'}-${this.dir}`;
      if (!this.hd) this.sprite.setScale(1 / CAST_HD.scale);
      if (force || !this.hd || this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim, !force);
      this.hd = true;
      return;
    }
    if (this.hd) {
      this.hd = false;
      this.sprite.setScale(1);
      this.sprite.setTexture('cast');
    }
    let anim = `${this.key}#${this.moving && !this.ghost ? 'walk' : 'idle'}-${this.dir}`;
    if (!this.scene.anims.exists(anim) && CAST.ghosts?.sheets[this.key]) {
      // (v2.4 perf P2) ghost art loads on the first death: the living idle frame stands in meanwhile
      this.scene.wantGhosts();
      anim = `${this.key.slice(0, this.key.lastIndexOf('/'))}#idle-${this.dir}`;
    }
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
  private speech: SpeechLayer | null = null;
  private talking: TalkingLayer | null = null;
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
  private area = { x: 0, y: 0, w: 0, h: 0 };
  // (v3 WP5b) the lobby's world and everything derived from its layout / map (set in init / create)
  private world: WorldId = 'v2';
  private L!: TownLayout;
  private TS = 16;
  private TOWN = { x: 0, y: 0, w: 0, h: 0 };
  private PLAZA: Plaza = PLAZA_V2;
  private SQUARE_VIEW = SQUARE_VIEW_V2;
  private FX_HOUSES: Record<string, HouseFx> = FX_HOUSES_V2;
  private view = { x: 0, y: 0, init: false };
  private doors: DoorObj[] = [];
  private enterCooldownUntil = 0;
  private boards = new Map<string, { objs: Phaser.GameObjects.GameObject[]; key: string }>();
  private boarded = new Map<string, Phaser.GameObjects.GameObject>();
  /** (v2.2) character tokens on the door boards + owner name callouts over each house. */
  private boardTokens: BoardTokenLayer | null = null;
  private houseNames: HouseNameLayer | null = null;
  private chimneys: { x: number; y: number; next: number }[] = [];
  private fx: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private fireflies: { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private npcs: Npc[] = [];
  /** Per-frame scratch for the townsfolk step (no allocations in stepAmbience). */
  private npcBrianbis: NpcPoint[] = [];
  private npcDelta: NpcPoint = { x: 0, y: 0 };
  /**
   * Where a townsfolk may stand: outdoors, and in a v3 world never on the voting circle (user request "no NPCs in the
   * voting circle", INTEGRATION.md §9.1: the plaza ellipse x 1.1 stays clear). v2 unchanged.
   */
  private npcSpot = (x: number, y: number) =>
    locationAt(this.L, x, y) === 'outdoors' && (this.world !== 'v3' || Math.hypot((x - this.PLAZA.cx) / this.PLAZA.rx, (y - this.PLAZA.cy) / this.PLAZA.ry) > NPC_PLAZA_CLEAR);
  private npcClear = (from: NpcPoint, to: NpcPoint) => this.npcSpot(to.x, to.y) && segmentClear(this.L, from.x, from.y, to.x, to.y);
  private pigeons: { s: Phaser.GameObjects.Sprite; home: { x: number; y: number }; away: number; ph: number }[] = [];
  private doorGlows: { img: Phaser.GameObjects.Image; d: DoorObj }[] = [];
  private lastPromptKey = '';
  private clockFace: { x: number; y: number; r: number } | null = null;
  private clockDepth = 0;
  private clockGfx: Phaser.GameObjects.Graphics | null = null;
  private clockKey = '';
  private lastInsideKey = '';
  private tier: TierState;
  /** Fixed lights of the current area (rebuilt on area / phase-view changes, see rebuildLights). */
  private areaLights: AreaLight[] = [];
  private lightsDirty = true;
  /** Inputs of the last lighting pass: the layer is re-stamped only when one of them changes. */
  private lit = { amb: -1, phase: '', tick: -1, carried: [] as number[] };
  private carriedBuf: number[] = [];
  private stampCfg = { scale: 1, tint: 0xffffff, alpha: 1, blendMode: Phaser.BlendModes.ADD, skipBatch: true };
  /** Pooled chimney puffs (sprite + start time); a free one has t0 < 0. */
  private puffs: { s: Phaser.GameObjects.Sprite; t0: number; x: number; y: number }[] = [];

  constructor(bridge: TownBridge, tier?: TierState) {
    super({ key: 'town' });
    this.bridge = bridge;
    this.tier = tier ?? new TierState(performance.now(), undefined, false);
  }

  /** (v3 WP5b) The lobby's world: the layout (server data) and the art to draw it with. */
  init() {
    this.world = currentWorld();
    this.L = currentLayout();
    this.TS = this.L.tileSize;
    const tb = this.L.townBounds;
    this.TOWN = { x: tb.x * this.TS, y: tb.y * this.TS, w: tb.w * this.TS, h: tb.h * this.TS };
    this.area = { ...this.TOWN };
  }

  textRes() {
    return Math.max(1, Math.ceil(this.cameras.main.zoom * (window.devicePixelRatio || 1)));
  }
  /** Text size (world px) that renders at about `screenPx` CSS px at the current zoom. */
  private fontPx(screenPx: number) {
    return Math.max(4, screenPx / Math.max(0.2, this.cssZoom()));
  }
  /** CSS px per world px (the camera zoom is in canvas px; the low tier renders the canvas smaller). */
  cssZoom() {
    return this.cameras.main.zoom / this.tier.renderScale;
  }

  preload() {
    const v3 = this.world === 'v3';
    this.load.image('terrain', v3 ? terrainV3Url : terrainUrl);
    this.load.image('decor', decorUrl);
    this.load.image('objects', objectsUrl);
    if (v3) {
      // the v3-only sprites + the v3 per-house overlay anchors (scripts/v3/classic.ts)
      this.load.image('objects-v3', objectsV3Url);
      this.load.json('objects-v3-frames', objectsV3JsonUrl);
      this.load.json('fx-houses-v3', squarePropsV3JsonUrl);
    }
    this.load.image('cast', castUrl);
    // (v2.4 perf P2) not here: cast-ghosts (first death) and cast-hd (an hd character in the lobby)
    this.load.spritesheet('lights', lightsUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.tilemapTiledJSON('town', v3 ? townV3JsonUrl : townJsonUrl);
    if (FX_PNG && FX_JSON) this.load.image('fx', FX_PNG);
  }

  create() {
    const conn = this.bridge.conn;
    this.cameras.main.setBackgroundColor('#09070d');
    this.cameras.main.setRoundPixels(true);
    // --- map
    const map = this.make.tilemap({ key: 'town' });
    this.applyMapWorld(map);
    const ground: Phaser.GameObjects.GameObject[] = [
      map.createLayer('ground', map.addTilesetImage('terrain', 'terrain')!, 0, 0)!.setDepth(0),
      map.createLayer('decor', map.addTilesetImage('decor', 'decor')!, 0, 0)!.setDepth(1),
    ];
    const atlas = this.textures.get('objects');
    for (const [name, r] of Object.entries((objectsAtlas as unknown as { frames: Record<string, { x: number; y: number; w: number; h: number }> }).frames)) atlas.add(name, 0, r.x, r.y, r.w, r.h);
    const extra = this.world === 'v3' ? (this.cache.json.get('objects-v3-frames') as { frames?: Record<string, { x: number; y: number; w: number; h: number }> } | undefined) : undefined;
    if (extra?.frames && this.textures.exists('objects-v3')) {
      const t = this.textures.get('objects-v3');
      for (const [name, r] of Object.entries(extra.frames)) t.add(name, 0, r.x, r.y, r.w, r.h);
    }
    this.defineCast();
    this.defineFx();
    const buildingDepth = new Map<string, number>();
    /** (v3) drawn sprite footprints (tiles) where they differ from the layout's placed AABB. */
    const drawnFp = new Map<string, BuildingDef['footprint']>();
    /** Prop anchor tiles by kind, in map order (pigeons by the fountain, the cat on a bench). */
    const propTiles = new Map<string, { x: number; y: number }[]>();
    for (const o of map.getObjectLayer('objects')?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      if (type === 'light') {
        this.lightSrcs.push({ x: o.x!, y: o.y!, r: Number(prop(o, 'radius') ?? 40), color: String(prop(o, 'color') ?? 'warm'), building: (prop(o, 'building') as string) || null, facade: !!prop(o, 'facade') });
        continue;
      }
      if (type === 'door') continue; // handled below (needs the building depth)
      const frame = String(prop(o, 'frame'));
      const depth = Number(prop(o, 'depth') ?? o.y! + o.height!);
      if (type === 'prop' || type === 'flat') {
        const list = propTiles.get(o.name) ?? [];
        list.push({ x: Math.round(o.x! / this.TS), y: Math.round((o.y! + o.height!) / this.TS) - 1 });
        propTiles.set(o.name, list);
      }
      const img = this.add
        .image(o.x!, o.y!, String(prop(o, 'atlas') || 'objects'), frame)
        .setOrigin(0, 0)
        .setDepth(type === 'flat' ? 2 : 10 + depth);
      if (type === 'flat') ground.push(img);
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
        const fp = prop(o, 'footprint');
        if (typeof fp === 'string' && fp) {
          try {
            drawnFp.set(id, JSON.parse(fp) as BuildingDef['footprint']);
          } catch {
            // ignore malformed
          }
        }
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
    this.setupDoors(map, buildingDepth, drawnFp);
    this.bakeGround(map.widthInPixels, map.heightInPixels, ground);
    // --- lighting (world-space multiply layer over the current area) + letterbox mask
    this.lightRT = this.add.renderTexture(0, 0, Math.max(this.TOWN.w, 400), Math.max(this.TOWN.h, 400)).setOrigin(0, 0).setDepth(5000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.mask = this.add.graphics().setDepth(5300);
    this.setupAmbience(propTiles);
    // --- (v2.2) door-board character tokens + house name callouts (before the first refreshBoards)
    const tokenEnv = { cssZoom: () => this.cssZoom(), textRes: () => this.textRes(), lowTier: () => this.tier.tier === 'low' };
    this.boardTokens = createBoardTokenLayer(this, { ...tokenEnv, houses: this.FX_HOUSES });
    this.houseNames = createHouseNameLayer(this, { ...tokenEnv, night: () => NIGHT.has(this.phase) || this.phase === 'dawn' });
    this.offs.push(() => {
      this.boardTokens?.destroy();
      this.houseNames?.destroy();
      this.boardTokens = this.houseNames = null;
    });
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());

    // --- views
    const onLobby = (v: LobbyRoomView | null) => {
      this.lobby = v;
      this.myPid = v?.youPid ?? this.myPid;
      this.wantLobbyArt(v);
      // Our own pid can arrive AFTER the first world:teleport / snapshot (join, reconnect): the
      // avatar couldn't be created then, so create it now (and drop a "remote" copy of ourselves).
      if (this.myPid && !this.myAvatar && this.ready) this.adoptSelf();
      this.refreshAppearances();
    };
    const onGame = (g: PlayerGameView | StorytellerGameView | null) => {
      const prev = this.phase;
      this.gview = g;
      this.phase = g?.phase ?? (this.lobby?.lobby.phase === 'finished' ? 'finished' : 'waiting');
      if (prev !== this.phase) this.onPhaseChange(prev, this.phase);
      this.lightsDirty = true; // empty cottages keep their windows dark
      if (g?.players.some((p) => !p.alive)) this.wantGhosts(); // (v2.4) ghost art on the first death
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
    this.offs.push(conn.lobbyView.subscribe(() => this.refreshBoards()));
    this.offs.push(this.tier.subscribe(() => this.refreshBoards()));
    this.offs.push(doorTagsStore.subscribe(() => this.refreshBoards()));
    this.bridge.registerLeave?.(() => this.leave());
    this.offs.push(() => this.bridge.registerLeave?.(null));
    this.offs.push(this.tier.subscribe(() => this.applyAmbienceVisibility()));

    // --- input (window-level so typing in inputs is ignored)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = keyDir(e.code);
      if (k) {
        this.keys.add(k);
        this.route = null;
        this.pendingGo = null;
        if (e.code.startsWith('Arrow')) e.preventDefault();
        // (inside a cottage you walk around; holding DOWN on the door spot walks out: stepLocal / interior.ts)
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
        if (pid === this.myPid) return this.myAvatar && this.ready ? { x: this.myAvatar.sprite.x, y: this.myAvatar.sprite.y } : null;
        const a = this.avatars.get(pid);
        return a && a.sprite.visible ? { x: a.sprite.x, y: a.sprite.y } : null;
      },
      entityAt: (x, y) => {
        let best: { pid: string; d: number } | null = null;
        for (const a of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) {
          if (!a.sprite.visible) continue;
          const dx = x - a.sprite.x;
          const dy = y - (a.sprite.y - 14);
          if (Math.abs(dx) > 14 || Math.abs(dy) > 20) continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { pid: a.pid, d };
        }
        return best?.pid ?? null;
      },
      characterOf: (pid) => this.castKey(pid).key.split('/')[0]!,
      spriteOf: (pid) => (pid === this.myPid ? this.myAvatar : this.avatars.get(pid))?.sprite ?? null, // v2.2 nick-face
      renderScale: () => this.tier.renderScale,
      passTap: (sx, sy) => this.handleTap(sx, sy, false),
      faceToward: (x, y) => {
        if (!this.myAvatar) return;
        this.myDir = dir8(x - this.me.x, y - (this.me.y - 12));
        this.myAvatar.setPose(this.myAvatar.sprite.x, this.myAvatar.sprite.y, this.myDir, false);
      },
    });
    this.offs.push(() => {
      this.social?.destroy();
      this.social = null;
    });
    // v2.2 chat speech bubbles: only over avatars drawn right now (see social/bubbles.ts)
    this.speech = createSpeechLayer(this, {
      conn,
      myPid: () => this.myPid,
      anchorOf: (pid) => {
        const a = pid === this.myPid ? (this.ready ? this.myAvatar : null) : this.avatars.get(pid);
        return a && a.sprite.visible && a.label.visible ? a.label : null;
      },
      lowTier: () => this.tier.tier === 'low',
      renderScale: () => this.tier.renderScale,
    });
    this.offs.push(() => {
      this.speech?.destroy();
      this.speech = null;
    });
    // v2.2 voice: who is talking (pixel outline + sound-wave glyph), visible avatars only (fx/talking.ts)
    this.talking = createTalkingLayer(this, {
      myPid: () => this.myPid,
      anchorOf: (pid) => {
        const a = pid === this.myPid ? (this.ready ? this.myAvatar : null) : this.avatars.get(pid);
        if (!a || !a.sprite.visible) return null;
        const l = a.label.visible && a.label.text ? a.label : null;
        return { x: a.sprite.x, y: a.sprite.y, labelRight: l ? l.x + l.displayWidth / 2 : null, labelMidY: l ? l.y - l.displayHeight / 2 : null };
      },
      spriteOf: (pid) => {
        const a = pid === this.myPid ? (this.ready ? this.myAvatar : null) : this.avatars.get(pid);
        return a && a.sprite.visible ? a.sprite : null;
      },
      tier: () => this.tier.tier,
    });
    this.offs.push(() => {
      this.talking?.destroy();
      this.talking = null;
    });
    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this;
    // Test hook (production-safe, opt-in per browser): localStorage 'ct.debug.camera' = '1' exposes the
    // camera so e2e tests can tap world points without re-implementing the camera maths.
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
          const z = cam.zoom * (r.width / this.scale.width); // CSS px per world px (low-tier render scale)
          return { x: r.left + (x - cam.worldView.x) * z, y: r.top + (y - cam.worldView.y) * z };
        },
        view: () => ({ ...this.cameras.main.worldView, zoom: this.cssZoom() }),
        /** (v3 WP5b) Which town this Classic scene draws: the lobby world and its map size (tiles). */
        town: () => ({ world: this.world, widthTiles: this.L.widthTiles, heightTiles: this.L.heightTiles, mapWidth: this.TOWN.w, plaza: { ...this.PLAZA } }),
        me: () => ({ ...this.me }),
        /** One drawn avatar (texture / frame / size), or null while hidden. */
        avatar: (pid: string) => {
          const a = pid === this.myPid ? this.myAvatar : this.avatars.get(pid);
          return a?.sprite.visible ? { texture: a.sprite.texture.key, frame: a.sprite.frame.name, width: a.sprite.displayWidth, height: a.sprite.displayHeight, x: a.sprite.x, y: a.sprite.y } : null;
        },
        /** Chat speech bubbles drawn right now (social/bubbles.ts), with CSS-px screen boxes. */
        bubbles: () => {
          const cam = this.cameras.main;
          const r = this.game.canvas.getBoundingClientRect();
          const z = cam.zoom * (r.width / this.scale.width);
          return (this.speech?.shown() ?? []).map((b) => ({ pid: b.pid, text: b.text, alpha: b.alpha, box: { x: r.left + (b.x - cam.worldView.x) * z, y: r.top + (b.y - cam.worldView.y) * z, width: b.w * z, height: b.h * z } }));
        },
        /** Door boards that show occupant tokens right now (gameplay/boardTokens.ts), by building id. */
        doorBoards: () => {
          const out: Record<string, unknown> = {};
          for (const d of this.doors) {
            const v = this.boardTokens?.inspect(d.b.id);
            if (v && this.boards.get(d.b.id)?.key) out[d.b.id] = v;
          }
          return out;
        },
        /** The visible townsfolk and whether they are shying away from a Brianbi. */
        npcs: () => this.npcs.filter((n) => n.sprite.visible).map((n) => ({ id: n.id, x: n.x, y: n.y, home: { ...n.home }, avoiding: n.avoiding })),
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

  /**
   * Ground + decor tiles and the flat decals never change: drawn ONCE into one texture, which is
   * then a single quad per frame instead of ~1200 culled tile quads + 45 images (and 47 fewer
   * entries in every depth sort). Same world grid, same NEAREST sampling, same draw order (all of
   * it below everything else, depth 0..2) = the same pixels. The parts leave the display list but
   * are kept to re-bake after a WebGL context restore (render-texture contents do not survive one).
   */
  private bakeGround(w: number, h: number, parts: Phaser.GameObjects.GameObject[]) {
    const rt = this.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(0);
    const bake = () => {
      rt.clear();
      rt.draw(parts);
    };
    bake();
    for (const p of parts) this.children.remove(p);
    const r = this.game.renderer;
    const restored = () => {
      bake();
      this.lit.amb = -1; // the light layer is re-stamped on the next frame too
    };
    r.on(Phaser.Renderer.Events.RESTORE_WEBGL, restored);
    this.offs.push(() => {
      r.off(Phaser.Renderer.Events.RESTORE_WEBGL, restored);
      for (const p of parts) p.destroy();
    });
  }

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
  }

  // (v2.4 perf P2) On-demand cast atlases. The town starts with cast.* only; the ghost variants
  // (cast-ghosts.*, 2.3 MiB GPU) load on the first death and the photo-real sheet (cast-hd.*, 740 KB)
  // as soon as a lobby member uses an hd character. Avatars draw the regular frames until then and
  // switch over when the texture arrives (refreshCastArt).
  private castLoads = new Set<string>();
  /** Queue an image for this scene's loader (once; retried after a failure) and run `done` when it is in. */
  private loadLate(key: string, url: string, done: () => void) {
    const live = () => this.sys.isActive() || !!this.sys.settings.active; // (also while create() runs)
    if (this.textures.exists(key) || this.castLoads.has(key) || !live()) return;
    this.castLoads.add(key);
    const ok = (k: string) => {
      if (k !== key) return;
      off();
      if (live() && this.textures.exists(key)) done();
    };
    const failed = (f: Phaser.Loader.File) => {
      if (f.key !== key) return;
      off();
      this.castLoads.delete(key); // try again the next time it is wanted
    };
    const off = () => {
      this.load.off(Phaser.Loader.Events.FILE_COMPLETE, ok);
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
    };
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, ok);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
    this.offs.push(off);
    this.load.image(key, url);
    if (!this.load.isLoading()) this.load.start();
  }
  wantGhosts() {
    if (CAST.ghosts) this.loadLate('cast-ghosts', castGhostsUrl, () => this.defineGhosts());
  }
  wantCastHd() {
    if (CAST_HD) this.loadLate('cast-hd', castHdUrl, () => this.defineCastHd());
  }
  /** Prefetch on-demand art a lobby member needs (an hd character), before their avatar is in view. */
  private wantLobbyArt(v: LobbyRoomView | null) {
    if (CAST_HD && v?.members.some((m) => CAST_HD.rows[m.cosmetics.preset ?? ''] !== undefined)) this.wantCastHd();
  }
  private defineGhosts() {
    const G = CAST.ghosts;
    if (!G || !this.textures.exists('cast-ghosts')) return;
    const tex = this.textures.get('cast-ghosts');
    const fw = CAST.frameWidth;
    const fh = CAST.frameHeight;
    for (const [key, pos] of Object.entries(G.sheets)) {
      CAST.directions.forEach((dir, r) => {
        G.rowOffset.forEach((dy, f) => tex.add(`${key}|${dir}|${f}`, 0, pos.x, pos.y + r * G.cellHeight + dy, fw, fh));
        this.anims.create({ key: `${key}#walk-${dir}`, frames: [1, 2, 3, 4].map((f) => ({ key: 'cast-ghosts', frame: `${key}|${dir}|${f}` })), frameRate: Math.round(CAST.walkFps * 1.25), repeat: -1 });
        this.anims.create({ key: `${key}#idle-${dir}`, frames: [0, 1, 2, 3, 4, 3, 2, 1].map((f) => ({ key: 'cast-ghosts', frame: `${key}|${dir}|${f}` })), frameRate: 5, repeat: -1 });
      });
    }
    this.refreshCastArt();
    this.refreshBoards(); // ghost door tokens are redrawn from the ghost art (boardTokens.ts)
  }
  private defineCastHd() {
    if (!CAST_HD || !this.textures.exists('cast-hd')) return;
    const hd = this.textures.get('cast-hd');
    // not pixel art: smooth filtering, unlike the rest of the (pixelArt: true) game
    hd.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const [key, r] of Object.entries(CAST_HD.rows)) {
      const ghost = key.includes('/ghost');
      CAST_HD.directions.forEach((dir, c) => {
        for (let f = 0; f < (ghost ? 1 : CAST_HD.frames.length); f++)
          hd.add(`${key}|${dir}|${f}`, 0, c * CAST_HD.frameWidth, (r + f) * CAST_HD.frameHeight, CAST_HD.frameWidth, CAST_HD.frameHeight);
        for (const action of ['idle', 'walk'])
          this.anims.create({
            key: `${key}#hd-${action}-${dir}`,
            frames: (action === 'walk' && !ghost ? [1, 2, 3, 4] : [0]).map((f) => ({ key: 'cast-hd', frame: `${key}|${dir}|${f}` })),
            frameRate: CAST_HD.walkFps,
            repeat: -1,
          });
      });
    }
    this.refreshCastArt();
  }
  /** Re-pick every avatar's animation (new on-demand art arrived). */
  private refreshCastArt() {
    this.myAvatar?.play(true);
    for (const a of this.avatars.values()) a.play(true);
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
  /** An overlay's frame exists (square-props sheet, or (v3) its own atlas). */
  private hasOv(ov: Ov) {
    if (!ov.atlas) return this.hasFx(ov.frame);
    return this.textures.exists(ov.atlas) && this.textures.get(ov.atlas).has(ov.frame);
  }

  /**
   * (v3 WP5b) The art's world (town-v3.json map properties): the square / plaza, NPC homes and the per-house
   * overlays. A v2 map has none of these properties and keeps the v2 values.
   */
  private applyMapWorld(map: Phaser.Tilemaps.Tilemap) {
    const mp = (name: string): unknown => {
      const p = map.properties as unknown;
      if (Array.isArray(p)) return (p as { name: string; value: unknown }[]).find((x) => x.name === name)?.value;
      return undefined;
    };
    const artWorld = String(mp('world') ?? 'v2');
    if (artWorld !== this.world) throw new Error(`town art is the ${artWorld} world, the lobby is ${this.world}`);
    if (map.width !== this.L.widthTiles || map.height !== this.L.heightTiles) throw new Error(`town map ${map.width}x${map.height} != layout ${this.L.widthTiles}x${this.L.heightTiles}`);
    const json = <T>(name: string): T | null => {
      const v = mp(name);
      if (typeof v !== 'string' || !v) return null;
      try {
        return JSON.parse(v) as T;
      } catch {
        return null;
      }
    };
    const plaza = json<Plaza>('plaza');
    if (plaza) {
      this.PLAZA = plaza;
      this.SQUARE_VIEW = squareViewOf(plaza);
    }
    this.npcHomes = json<Record<string, TilePoint>>('npcHomes') ?? NPC_HOMES_V2;
    if (this.world === 'v3') this.FX_HOUSES = (this.cache.json.get('fx-houses-v3') as { meta?: { houses?: Record<string, HouseFx> } } | undefined)?.meta?.houses ?? {};
  }
  private npcHomes: Record<string, TilePoint> = NPC_HOMES_V2;

  // ---------------------------------------------------------------------------------------
  // doors

  private setupDoors(map: Phaser.Tilemaps.Tilemap, buildingDepth: Map<string, number>, drawnFp: Map<string, BuildingDef['footprint']>) {
    const art = new Map<string, Phaser.Types.Tilemaps.TiledObject>();
    for (const o of map.getObjectLayer('objects')?.objects ?? []) {
      const type = (o.type as string) || ((o as unknown as { class?: string }).class ?? '');
      if (type === 'door') art.set(String(prop(o, 'building') ?? o.name), o);
    }
    for (const server of this.L.buildings) {
      // (v3) taps, boards and the boarded planks follow the drawn sprite; doors / rules use the server data
      const fp = drawnFp.get(server.id);
      const b: BuildingDef = fp ? { ...server, footprint: fp } : server;
      const at = tileCenterPx(this.L, b.door);
      const inward = doorInward(b); // doorNormal (v3) or the v2 footprint rule (rules/doors.ts)
      const d: DoorObj = { b, at, inward, open: 0 };
      const o = art.get(b.id);
      const leaf = o ? String(prop(o, 'leaf') ?? '') : '';
      const hole = o ? String(prop(o, 'hole') ?? '') : '';
      const tex = o ? String(prop(o, 'atlas') || 'objects') : 'objects';
      if (o && leaf && hole && this.textures.exists(tex) && this.textures.get(tex).has(leaf) && this.textures.get(tex).has(hole)) {
        const depth = (buildingDepth.get(b.id) ?? 10 + at.y) + 0.02;
        const hinge = String(prop(o, 'hinge') ?? 'left');
        d.hole = this.add.image(o.x!, o.y!, tex, hole).setOrigin(0, 0).setDepth(depth).setVisible(false);
        d.leaf = this.add
          .image(hinge === 'right' ? o.x! + o.width! : o.x!, o.y!, tex, leaf)
          .setOrigin(hinge === 'right' ? 1 : 0, 0)
          .setDepth(depth + 0.01)
          .setVisible(false);
      }
      this.doors.push(d);
      const g = this.FX_HOUSES[b.id]?.doorglow;
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
    return houseInUseRule(this.gview, b);
  }

  private doorRuleCtx(): DoorRuleCtx {
    return { layout: this.L, amStoryteller: this.amStoryteller(), phase: this.phase, mySeat: this.mySeat(), override: (id) => this.gameplay?.doorOverride(id) };
  }

  private doorLocked(b: BuildingDef, exit: boolean): boolean {
    return doorLockedRule(this.doorRuleCtx(), b, exit);
  }

  private lockText(b: BuildingDef, exit: boolean): string {
    return lockTextRule(this.doorRuleCtx(), b, exit);
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
    // Moves go out at 15 Hz: flush the feet position first so the server does not judge the door
    // range from the previous one, still a step away from the doorstep (Isaac, PR #2).
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
    const d = autoEnterDoor(this.me, vx, vy, this.doors);
    if (!d) return;
    if (!this.houseInUse(d.b) && !this.amStoryteller()) {
      this.flashPrompt('Nobody lives here', true);
      return;
    }
    this.enter(d.b);
  }

  /** Name labels at the current zoom (also for avatars created after the last fitCamera: inside a room the zoom is ~2x the outdoor one). */
  private styleLabel(a: Avatar) {
    a.setLabelStyle(this.textRes(), this.fontPx(10.5), Math.max(1.5, this.fontPx(10.5) / 4));
  }

  /** Inside: pushing down on the interior door spot walks out through the doorway (interior.ts). */
  private exitGate = new ExitGate();
  private tryWalkOut(vx: number, vy: number) {
    const b = this.currentBuilding();
    if (!b || !this.ready || !pushesOut(this.L, b, this.me, vx, vy)) return this.exitGate.reset();
    if (this.exitGate.try(performance.now())) this.leave();
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
    const target = this.tapTarget(w.x, w.y);
    const inRoomTap = this.me.location !== 'outdoors' && target.enter === null && this.insideArea(w.x, w.y);
    if (this.amStoryteller() && this.gview?.kind === 'storyteller' && !inRoomTap) {
      // Storyteller: click-to-teleport (a building = straight inside, like a visit); inside a room
      // the Storyteller walks like everyone else (below).
      if (this.me.location !== 'outdoors' && target.enter === null) return;
      if (target.enter) this.bridge.conn.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: target.enter } });
      else if (this.me.location === 'outdoors') this.bridge.conn.send('st:command', { type: 'teleport_self', to: { kind: 'point', x: Math.round(target.x), y: Math.round(target.y) } });
      return;
    }
    if (this.me.location !== 'outdoors') {
      // inside: walk to the tapped spot in the room (the doorway = walk there and out)
      const b = this.currentBuilding();
      const t = b ? interiorTapTarget(this.L, b, w.x, w.y) : null;
      if (b && t && this.gameplay?.wantsLocalInput()) {
        const pts = interiorRoute(this.L, b, { x: this.me.x, y: this.me.y }, t);
        if (pts) this.route = { pts, enter: t.exit ? b.id : null };
      }
      return;
    }
    this.goTo(target);
  }

  private insideArea(x: number, y: number) {
    return x >= this.area.x && y >= this.area.y && x < this.area.x + this.area.w && y < this.area.y + this.area.h;
  }

  /** What a tap at a world point means: a cottage (its sprite or doorstep) or a spot on the ground. */
  private tapTarget(x: number, y: number): { x: number; y: number; enter: string | null } {
    return tapTargetRule(this.L, this.doors, x, y);
  }

  private goTo(t: { x: number; y: number; enter: string | null }) {
    if (!this.gameplay?.wantsLocalInput()) return;
    const goal = t.enter ? t : { ...t, y: t.y + 6 };
    const pts = findPath(this.L, { x: this.me.x, y: this.me.y }, { x: goal.x, y: goal.y }, 'outdoors');
    if (!pts) return;
    this.route = { pts, enter: t.enter };
  }

  // ---------------------------------------------------------------------------------------
  // appearances

  private castKey(pid: string): { key: string; name: string; st: boolean; lantern: boolean; ghost: boolean } {
    const c = castIdentity(pid, this.lobby, this.gview, this.myPid);
    if (c.st) return { key: 'storyteller', name: c.name, st: true, lantern: true, ghost: false };
    const id = c.id;
    let key = id;
    if (c.dead) {
      const g = c.ghostVoteAvailable ? `${id}/ghost` : `${id}/ghost-spent`;
      key = hasCastSheet(g) ? g : hasCastSheet(`${id}/ghost`) ? `${id}/ghost` : id;
    }
    if (!hasCastSheet(key)) key = Object.keys(CAST.sheets)[0]!;
    return { key, name: c.name, st: false, lantern: c.lantern, ghost: c.dead };
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

  /** Create our own avatar once our pid is known (see onLobby) at the last placed position. */
  private adoptSelf() {
    const ghost = this.myPid ? this.avatars.get(this.myPid) : undefined;
    if (ghost) {
      ghost.destroy();
      this.avatars.delete(this.myPid!);
    }
    this.placeMe(this.me.x, this.me.y, this.me.location);
  }

  private placeMe(x: number, y: number, location: LocationId) {
    const prevLoc = this.me.location;
    this.me.x = x;
    this.me.y = y;
    this.me.location = location;
    this.me.moving = false;
    if (!this.myAvatar && this.myPid) {
      this.myAvatar = new Avatar(this, this.myPid, x, y);
      this.styleLabel(this.myAvatar);
      const k = this.castKey(this.myPid);
      this.myAvatar.setAppearance(k.key, k.name, k);
    }
    this.myAvatar?.setPose(x, y, this.myDir, false);
    if (!this.ready || prevLoc !== location) {
      this.ready = true;
      this.onLocationChange(prevLoc);
    }
  }

  onTeleport(t: WorldTeleport) {
    // A reloaded / rejoined scene starts at seq 0, but the server keeps the last movement sequence
    // it accepted: adopt it, or our moves are dropped as stale until the counter catches up (cafb858).
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
    // The spawn teleport can arrive before this scene exists; snapshots carry ackSeq too (cafb858).
    this.seq = Math.max(this.seq, s.ackSeq);
    noteServerTime(s.t);
    const now = performance.now();
    const seen = new Set<string>();
    for (const e of s.entities) {
      if (e.id === this.myPid) {
        if (!this.ready || !this.myAvatar) this.placeMe(e.x, e.y, e.location);
        continue;
      }
      seen.add(e.id);
      let a = this.avatars.get(e.id);
      if (!a) {
        a = new Avatar(this, e.id, e.x, e.y);
        this.styleLabel(a);
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
      if (lastS && a.isST && Math.hypot(lastS.x - e.x, lastS.y - e.y) > ST_JUMP_PX) {
        // a Storyteller jump (teleport): poof out, poof in, no sliding across the square
        if (a.location === this.me.location) {
          this.poof(lastS.x, lastS.y);
          this.poof(e.x, e.y);
        }
        a.samples = [];
      }
      pushSample(a.samples, { t: now, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
    }
    for (const [pid, a] of this.avatars)
      if (!seen.has(pid)) {
        if (a.isST && a.location === this.me.location && a.sprite.visible) this.poof(a.sprite.x, a.sprite.y);
        a.destroy();
        this.avatars.delete(pid);
        remoteEntities.delete(pid);
      }
    this.refreshInside();
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
    return this.L.buildings.find((b) => b.id === id);
  }

  private onLocationChange(prev: LocationId) {
    this.route = null;
    this.fitCamera();
    for (const b of this.boards.values()) for (const o of b.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.me.location === 'outdoors');
    for (const o of this.boarded.values()) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.me.location === 'outdoors');
    this.houseNames?.setVisible(this.me.location === 'outdoors');
    this.applyAmbienceVisibility();
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
      const key = !day || !inUse ? '' : JSON.stringify([res?.name ?? '', view?.tags.map((t) => [t.pid, t.name, t.ghost, t.preset]) ?? [], view?.overflow ?? 0, Math.round(this.cssZoom() * 20)]);
      const cur = this.boards.get(b.id);
      if (cur && cur.key === key) continue;
      this.boardTokens?.forget(b.id);
      if (cur) for (const o of cur.objs) o.destroy();
      const objs = key ? this.makeBoard(d, res?.name ?? null, view) : [];
      for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(outdoors);
      this.boards.set(b.id, { objs, key });
    }
    this.refreshHouseNames();
  }

  /** (v2.2) Owner name callouts: one per lived-in house, from public seats only (see houseNames.ts). */
  private refreshHouseNames() {
    if (!this.houseNames) return;
    const owners = houseOwners(this.L, this.gview?.players ?? null, this.lobby?.members ?? null);
    const inputs: HouseLabelInput[] = [];
    for (const d of this.doors) {
      const owner = owners[d.b.id];
      if (!owner) continue;
      // tail tip just above the doorway (the art's exact door rect when there is one)
      const door = this.FX_HOUSES[d.b.id]?.boarded;
      const x = door ? door.wx + door.w / 2 : d.at.x;
      const y = door ? door.wy - 1 : d.at.y - this.TS - 22;
      inputs.push({ id: d.b.id, x: Math.round(x), y: Math.round(y), houseW: d.b.footprint.w * this.TS, owner, mine: owner.pid === this.myPid, avoid: this.boardTokens?.rectOf(d.b.id) ?? null });
    }
    this.houseNames.update(inputs);
    this.houseNames.setVisible(this.me.location === 'outdoors');
  }

  private makeBoarded(d: DoorObj): Phaser.GameObjects.GameObject {
    const meta = this.FX_HOUSES[d.b.id];
    if (meta?.boarded && this.hasOv(meta.boarded)) {
      // exact planks over this cottage's door + its windows unlit (an empty house, day and night alike)
      const c = this.add.container(0, 0).setDepth(10 + (d.b.footprint.y + d.b.footprint.h) * this.TS + 0.05);
      if (meta.unlit && this.hasOv(meta.unlit)) c.add(this.add.image(meta.unlit.wx, meta.unlit.wy, meta.unlit.atlas ?? 'fx', meta.unlit.frame).setOrigin(0, 0));
      c.add(this.add.image(meta.boarded.wx, meta.boarded.wy, meta.boarded.atlas ?? 'fx', meta.boarded.frame).setOrigin(0, 0));
      c.setVisible(this.me.location === 'outdoors');
      return c;
    }
    const depth = 10 + d.at.y - this.TS + 0.5;
    const south = d.inward.y < 0;
    const x = south ? d.at.x : d.at.x + d.inward.x * 9;
    const y = d.at.y - this.TS - 2;
    if (this.hasFx('boarded')) return this.add.image(Math.round(x), Math.round(y + 2), 'fx', 'boarded').setOrigin(0.5, 1).setDepth(depth).setVisible(this.me.location === 'outdoors');
    const g = this.add.graphics().setDepth(depth).setVisible(this.me.location === 'outdoors');
    g.fillStyle(0x3a2616, 1);
    for (const dy of [-16, -10, -4]) g.fillRect(Math.round(x - 7), Math.round(y + dy), 14, 3);
    g.fillStyle(0x6b4a2c, 1);
    for (const dy of [-16, -10, -4]) g.fillRect(Math.round(x - 6), Math.round(y + dy), 12, 1);
    return g;
  }

  /**
   * The bulletin board (daytime only): who is inside as pinned character tokens (v2.2: no names on
   * the board — hover / tap a token for the name; the owner's name is the house callout instead).
   */
  private makeBoard(d: DoorObj, _resident: string | null, view: DoorBoardView | undefined): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const south = d.inward.y < 0;
    // the board stands beside the door: right of a south door, toward the square for side doors
    const spot = this.FX_HOUSES[d.b.id]?.board;
    const bx = spot ? spot.x : south ? d.at.x + 13 : d.at.x - d.inward.x * 2;
    const by = spot ? spot.y : south ? d.at.y - 2 : d.at.y - 18;
    const depth = 10 + by + 1;
    const anchor = FX_JSON?.meta?.anchors?.board ?? { x: 11, y: 26 };
    const bf = FX_JSON?.frames.board;
    if (view?.shown.length && this.boardTokens) {
      // occupied: the board grows to hold its tokens (kept clear of the doorway)
      const dr = this.FX_HOUSES[d.b.id]?.boarded;
      const door = dr ? { l: dr.wx, r: dr.wx + dr.w, t: dr.wy, b: dr.wy + dr.h } : { l: d.at.x - 6, r: d.at.x + 6, t: d.at.y - this.TS - 20, b: d.at.y - this.TS };
      objs.push(...this.boardTokens.build(d.b.id, bx, by, depth, view, door));
    } else if (this.hasFx('board') && bf) objs.push(this.add.image(Math.round(bx), Math.round(by), 'fx', 'board').setOrigin(anchor.x / bf.w, anchor.y / bf.h).setDepth(depth));
    return objs;
  }

  // ---------------------------------------------------------------------------------------
  // ambience (time + public phase only)

  private setupAmbience(propTiles: Map<string, { x: number; y: number }[]>) {
    // Fireflies: a handful of soft glowing dots over the grass, night only (also at bedtime/dawn).
    const glowKey = this.hasFx('firefly_0') ? null : this.makeDotTexture();
    for (let i = 0; i < 14; i++) {
      const x = this.TOWN.x + 24 + ((i * 97) % (this.TOWN.w - 48));
      const y = this.TOWN.y + 40 + ((i * 61) % (this.TOWN.h - 80));
      const img = glowKey ? this.add.image(x, y, glowKey) : this.add.image(x, y, 'fx', 'firefly_0');
      img.setDepth(4050).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.fireflies.push({ img, x, y, ph: i * 1.7, sp: 0.6 + (i % 5) * 0.12 });
    }
    // Townsfolk: plain background people wandering near a fixed home spot (npcRoaming.ts); they
    // shy away from a visible Brianbi but can never be chased out of their home radius.
    const T = (x: number, y: number) => ({ x: x * this.TS + 8, y: y * this.TS + 14 });
    const homes: Record<string, NpcPoint> = {};
    for (const [id, t] of Object.entries(this.npcHomes)) homes[id] = T(t.x, t.y);
    // pigeons by the fountain and a cat asleep on the east bench (cosmetic, local only)
    const fountain = propTiles.get('fountain')?.[0];
    if (fountain && this.hasFx('pigeon_0')) {
      if (!this.anims.exists('fx#peck')) this.anims.create({ key: 'fx#peck', frames: ['pigeon_0', 'pigeon_1', 'pigeon_2', 'pigeon_1'].map((frame) => ({ key: 'fx', frame })), frameRate: 4, repeat: -1 });
      if (this.hasFx('pigeon_fly_0') && !this.anims.exists('fx#flap')) this.anims.create({ key: 'fx#flap', frames: ['pigeon_fly_0', 'pigeon_fly_1'].map((frame) => ({ key: 'fx', frame })), frameRate: 10, repeat: -1 });
      [[-10, 20], [6, 24], [30, 18]].forEach(([dx, dy], i) => {
        const home = { x: fountain.x * this.TS + dx!, y: fountain.y * this.TS + dy! };
        const s = this.add.sprite(home.x, home.y, 'fx', 'pigeon_0').setDepth(10 + home.y);
        s.play({ key: 'fx#peck', startFrame: i % 3 });
        this.pigeons.push({ s, home, away: 0, ph: i * 2.1 });
      });
    }
    if (this.hasFx('cat_sleep')) {
      const bench = [...(propTiles.get('bench') ?? [])].sort((a, b) => b.x - a.x)[0];
      if (bench) this.add.image(bench.x * this.TS + 22, bench.y * this.TS + 6, 'fx', 'cat_sleep').setOrigin(0.5, 1).setDepth(10 + bench.y * this.TS + 17);
    }
    for (const [id, home] of Object.entries(homes)) {
      if (!CAST.sheets[id]) continue;
      const p = nearestFree(this.L, home, 40, this.npcSpot);
      if (!p) continue;
      const sprite = this.add.sprite(p.x, p.y, 'cast').setOrigin(CAST.anchor.x / CAST.frameWidth, CAST.anchor.y / CAST.frameHeight).setAlpha(0.96);
      this.npcs.push({ id, sprite, ...createNpcRoamer(p, this.npcs.length), dir: 'down' });
    }
  }

  /** How many fireflies / townsfolk / pigeons the current render tier shows (the first n of each). */
  private ambienceCount(kind: 'fireflies' | 'townsfolk' | 'pigeons'): number {
    return this.tier.tier === 'low' ? LOW_TIER_AMBIENCE[kind] : Infinity;
  }

  private applyAmbienceVisibility() {
    const outdoors = this.me.location === 'outdoors';
    const folk = this.ambienceCount('townsfolk');
    const flies = this.ambienceCount('fireflies');
    this.npcs.forEach((n, i) => n.sprite.setVisible(outdoors && DAYLIKE.has(this.phase) && i < folk));
    this.fireflies.forEach((f, i) => f.img.setVisible(outdoors && i < flies));
    for (const e of this.fx) e.setVisible(outdoors);
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
    const flies = this.ambienceCount('fireflies');
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i]!;
      const a = dark && outdoors && i < flies ? Math.max(0, Math.sin(t * f.sp + f.ph)) * 0.9 : 0;
      f.img.setAlpha(a);
      if (a > 0) f.img.setPosition(Math.round(f.x + Math.sin(t * 0.5 + f.ph) * 10), Math.round(f.y + Math.cos(t * 0.37 + f.ph * 2) * 6));
    }
    // chimney smoke (always, gently; more visible at dusk) — none on the low render tier
    if (outdoors && (this.tier.tier !== 'low' || LOW_TIER_AMBIENCE.smoke)) {
      for (const c of this.chimneys) {
        if (now < c.next) continue;
        c.next = now + 900 + ((c.x * 37 + c.y * 11) % 700);
        this.puff(c.x, c.y, now);
      }
    }
    this.stepPuffs(now);
    // door glows: every lived-in cottage alike (no occupancy), warmer at dusk and night
    const glowK = NIGHT.has(this.phase) ? 0.55 : this.phase === 'bedtime' || this.phase === 'dawn' ? 0.45 : 0.12;
    for (const g of this.doorGlows) g.img.setAlpha(outdoors && this.houseInUse(g.d.b) ? glowK * (0.9 + 0.1 * Math.sin(t * 2 + g.d.at.x)) : 0);
    // pigeons: peck by day, scatter when you walk up, drift back later
    const birds = this.ambienceCount('pigeons');
    for (let i = 0; i < this.pigeons.length; i++) {
      const p = this.pigeons[i]!;
      if (i >= birds) {
        p.s.setVisible(false);
        continue;
      }
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
    // townsfolk: daytime only, wandering near home. They react only to Brianbi avatars already
    // drawn outdoors (hidden / indoor / night players can never move an NPC or reveal themselves).
    const day = DAYLIKE.has(this.phase);
    const folk = this.ambienceCount('townsfolk');
    const brianbis = this.npcBrianbis;
    brianbis.length = 0;
    if (day && outdoors && this.ready) {
      for (const a of this.avatars.values()) if (a.key === 'brianbi' && a.location === 'outdoors' && a.sprite.visible) brianbis.push(a.sprite);
      const m = this.myAvatar;
      if (m && m.key === 'brianbi' && m.sprite.visible) brianbis.push(m.sprite);
    }
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i]!;
      n.sprite.setVisible(day && outdoors && i < folk);
      if (!day || i >= folk) continue;
      const delta = stepNpcRoamer(n, dt, now, brianbis, this.npcClear, this.npcDelta);
      const moving = Math.hypot(delta.x, delta.y) > 0.01;
      if (moving) n.dir = dir8(delta.x, delta.y);
      n.sprite.setPosition(Math.round(n.x), Math.round(n.y));
      if (n.sprite.depth !== 10 + n.y) n.sprite.setDepth(10 + n.y);
      const anim = `${n.id}#${moving ? 'walk' : 'idle'}-${moving ? n.dir : n.dir === 'up' ? 'down' : n.dir}`;
      if (this.anims.exists(anim) && n.sprite.anims.currentAnim?.key !== anim) n.sprite.play(anim, true);
    }
  }

  private puff(x: number, y: number, now: number) {
    if (this.anims.exists('fx#smoke')) {
      // pooled: a puff drifts 18 px up and 4 px right over 1.6 s (linear), then is parked hidden
      let p = this.puffs.find((q) => q.t0 < 0);
      if (!p) {
        p = { s: this.add.sprite(x, y, 'fx').setDepth(4060).setAlpha(0.75), t0: 0, x, y };
        this.puffs.push(p);
      }
      p.t0 = now;
      p.x = x;
      p.y = y;
      p.s.setPosition(x, y).setVisible(true);
      p.s.play('fx#smoke');
      return;
    }
    const s = this.add.image(x, y, this.makeSmokeTexture()).setDepth(4060).setAlpha(0.5);
    this.tweens.add({ targets: s, y: y - 18, x: x + 5, alpha: 0, scale: 1.8, duration: 1800, onComplete: () => s.destroy() });
  }
  private stepPuffs(now: number) {
    for (const p of this.puffs) {
      if (p.t0 < 0) continue;
      const k = (now - p.t0) / 1600;
      if (k >= 1) {
        p.t0 = -1;
        p.s.setVisible(false);
        continue;
      }
      p.s.setPosition(p.x + 4 * k, p.y - 18 * k);
    }
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
    this.applyAmbienceVisibility();
    this.refreshInside();
  }

  // ---------------------------------------------------------------------------------------
  // camera: the whole town (or the room you're in) fitted to the screen

  private fitCamera() {
    const cam = this.cameras.main;
    const b = this.currentBuilding();
    const a = b ? roomArea(this.L, b) : { ...this.TOWN };
    this.area = a;
    const w = this.scale.width;
    const h = this.scale.height;
    if (b) {
      // inside: the whole (walkable) room, cosy, not huge — above the "Inside … with …" panel at the bottom
      const k = this.tier.renderScale; // the panel is sized in CSS px
      const reserve = insideReserveCss(h / k, touchUi()) * k;
      const zoom = Math.min(Math.min(w / a.w, (h - reserve - 8) / a.h) * 0.94, 7);
      cam.setZoom(zoom);
      cam.centerOn(a.x + a.w / 2, a.y + a.h / 2 + reserve / 2 / zoom);
    } else {
      // outdoors: the zoom of the square's preset view (whole circle + the clock tower's face)
      cam.setZoom(outdoorZoom(w, h, this.SQUARE_VIEW));
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
    this.lightsDirty = true;
    const res = this.textRes();
    for (const av of [...this.avatars.values(), ...(this.myAvatar ? [this.myAvatar] : [])]) av.setLabelStyle(res, this.fontPx(10.5), Math.max(1.5, this.fontPx(10.5) / 4));
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
    this.speech?.update();
    this.talking?.update();
    this.animateDoors(dt);
    this.stepAmbience(dt, time);
    this.updateCamera(dt);
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
    const c = this.gview?.clock ?? null;
    const idle = !c || (c.endsAt === null && c.remainingMs === null);
    const top = -Math.PI / 2;
    let end = top;
    let frac = 0;
    if (c && !idle) {
      const left = Math.max(0, c.paused ? (c.remainingMs ?? 0) : (c.endsAt ?? 0) - serverNow());
      frac = c.totalMs > 0 ? Math.min(1, left / c.totalMs) : 0;
      end = top + frac * Math.PI * 2;
    }
    // Redraw only when the picture changes: the hand's tip moved >= 1/4 screen px, or the state did.
    const key =
      this.me.location !== 'outdoors' ? 'in' : !c || idle ? 'idle' : `${c.stage}|${c.paused}|${frac > 0.002}|${Math.round(end * f.r * 0.86 * this.cameras.main.zoom * 4)}`;
    if (key === this.clockKey) return;
    this.clockKey = key;
    g.clear();
    if (this.me.location !== 'outdoors') return;
    const hand = (ang: number, len: number, w: number, col: number) => {
      g.lineStyle(w, col, 1);
      g.lineBetween(f.x, f.y, f.x + Math.cos(ang) * len, f.y + Math.sin(ang) * len);
    };
    if (!c || idle) {
      hand(top - Math.PI / 6, f.r * 0.82, 1, 0x120e16);
      hand(top - Math.PI / 72, f.r * 0.55, 2, 0x120e16);
    } else {
      const col = c.stage === 'nominations' ? 0xc0413b : c.stage === 'bedtime' ? 0x6f7fd0 : 0xd5b56a;
      if (frac > 0.002) {
        g.fillStyle(col, c.paused ? 0.28 : 0.5);
        // = g.slice(…) + g.fillPath() pixel for pixel, without the per-render arc tessellation + earcut
        fillSliceFan(g, f.x, f.y, f.r * 0.86, top, end);
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
    let tx = this.SQUARE_VIEW.x + this.SQUARE_VIEW.w / 2;
    let ty = this.SQUARE_VIEW.y + this.SQUARE_VIEW.h / 2;
    if (this.ready) {
      const inSquare = Math.hypot((this.me.x - this.PLAZA.cx) / this.PLAZA.rx, (this.me.y - 8 - this.PLAZA.cy) / this.PLAZA.ry) <= 1.08;
      if (!inSquare) {
        // lean toward the player just enough to keep them comfortably on screen
        const lean = 0.85;
        tx = tx + (this.me.x - tx) * lean;
        ty = ty + (this.me.y - 10 - ty) * lean;
      }
    }
    const clamp = (c: number, lo: number, size: number, view: number) => (size <= view ? lo + size / 2 : Phaser.Math.Clamp(c, lo + view / 2, lo + size - view / 2));
    tx = clamp(tx, this.TOWN.x, this.TOWN.w, vw);
    ty = clamp(ty, this.TOWN.y, this.TOWN.h, vh);
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
      this.myAvatar!.setPose(d.x, d.y, this.myDir, d.moving); // outdoors and inside (walk to bed)
      this.lastSent = { x: d.x, y: d.y, moving: false, facing: d.facing };
      this.route = null;
      this.publishLocal(false);
      return;
    }
    let { vx, vy } = keyVector(this.keys);
    let following = false;
    if (vx === 0 && vy === 0 && this.route) {
      // A door at the end of the route waits out the anti-bounce cooldown (rules/movement routeStep).
      const r = routeStep(this.route, this.me, performance.now() < this.enterCooldownUntil);
      if (r.kind === 'arrived') {
        const enter = r.enter;
        this.route = null;
        if (enter && this.currentBuilding()?.id === enter) {
          // inside: a tap on the doorway walked us to the door spot; now out
          this.myDir = 'down';
          this.leave();
        } else if (enter) {
          const d0 = this.doors.find((x) => x.b.id === enter);
          if (d0) {
            this.myDir = dir8(d0.inward.x, d0.inward.y);
            this.enter(d0.b);
          }
        }
      } else if (r.kind === 'follow') {
        vx = r.vx;
        vy = r.vy;
        following = true;
      }
    }
    const len = Math.hypot(vx, vy);
    let moving = false;
    if (len > 0) {
      vx /= len;
      vy /= len;
      let step = moveSpeed(this.amStoryteller() && this.gview?.kind === 'storyteller' ? this.gview.travelSpeedMult : null) * dt;
      if (following) {
        const next = this.route?.pts[0];
        if (next) step = Math.min(step, Math.hypot(next.x - this.me.x, next.y - this.me.y));
      }
      moving = integrateStep(this.L, this.me, vx, vy, step).moved;
      this.myDir = dir8(vx, vy);
      this.me.facing = toFacing(this.myDir, vx, vy);
      if (following && !moving) this.route = null; // blocked: give up quietly
      if (!following) this.checkAutoEnter(vx, vy);
    }
    if (this.me.location !== 'outdoors') this.tryWalkOut(following ? 0 : vx, following ? 0 : vy);
    this.me.moving = moving;
    this.myAvatar!.setPose(this.me.x, this.me.y, this.myDir, moving);
    const changed = poseChanged({ x: this.me.x, y: this.me.y, moving, facing: this.me.facing }, this.lastSent);
    if (changed && now - this.lastSentAt >= 1000 / MOVE_HZ) this.sendMove(now, moving);
    this.publishLocal(false);
  }

  private sendMove(now: number, moving: boolean) {
    this.seq++;
    const x = wirePx(this.me.x);
    const y = wirePx(this.me.y);
    this.bridge.conn.send('move', { seq: this.seq, x, y, facing: this.me.facing, moving });
    this.lastSent = { x: this.me.x, y: this.me.y, moving, facing: this.me.facing };
    this.lastSentAt = now;
  }

  private lastLocalPublish = { x: NaN, y: NaN, loc: '', at: -Infinity };
  /**
   * localPlayer: get() always returns the current predicted position (per-frame readers — voice
   * gains, sound, gameplay — read it directly), but subscribers (HUD) are notified at most every
   * LOCAL_PUBLISH_MS while walking, and at once on a location (or player) change.
   */
  private publishLocal(force: boolean) {
    const p = this.lastLocalPublish;
    const cur = localPlayer.get();
    const now = performance.now();
    const moved = Math.abs(p.x - this.me.x) >= 0.5 || Math.abs(p.y - this.me.y) >= 0.5;
    if (force || p.loc !== this.me.location || cur.pid !== this.myPid || (moved && now - p.at >= LOCAL_PUBLISH_MS)) {
      p.x = this.me.x;
      p.y = this.me.y;
      p.loc = this.me.location;
      p.at = now;
      localPlayer.set({ pid: this.myPid, x: this.me.x, y: this.me.y, location: this.me.location });
      return;
    }
    // between notifications: keep the published object current (same object => no re-render)
    cur.x = this.me.x;
    cur.y = this.me.y;
  }

  private stepRemotes() {
    const nowMs = performance.now();
    const renderAt = nowMs - INTERP_DELAY_MS;
    for (const a of this.avatars.values()) {
      const s = a.samples;
      const at = interpolate(s, renderAt);
      if (!at) continue;
      const { x, y, ref } = at;
      const stale = nowMs - s[s.length - 1]!.t > REMOTE_STALE_MS;
      const moving = ref.moving && !stale;
      const d = remoteDir(a.dir, moving, x - a.last.x, y - a.last.y, ref.facing);
      a.setPose(x, y, d, moving);
      a.setVisible(a.location === this.me.location);
      const e = remoteEntities.get(a.pid);
      if (e) {
        e.x = x;
        e.y = y;
        e.location = a.location;
      } else remoteEntities.set(a.pid, { x, y, location: a.location });
    }
  }

  private updatePrompt() {
    if (this.lastPromptKey === 'flash') return;
    let text: string | null = null;
    let locked = false;
    if (this.ready && this.me.location === 'outdoors' && !this.route) {
      const p = doorPrompt(this.me, this.doors, {
        amStoryteller: this.amStoryteller(),
        inUse: (b) => this.houseInUse(b),
        locked: (b) => this.doorLocked(b, false),
        lockText: (b) => this.lockText(b, false),
        title: (b) => this.houseTitle(b),
      });
      if (p) {
        text = p.text;
        locked = p.locked;
      }
    }
    const key = text ? `${text}|${locked}` : '';
    if (key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    this.bridge.setPrompt(text ? { key: '', text, locked } : null);
  }

  /**
   * The light layer: ambient colour + light stamps (ADD) in a world-space RenderTexture drawn with
   * MULTIPLY over the area. It is re-stamped only when an input changed — the ambient colour (still
   * easing after a phase change), the flicker step (12 Hz), the phase, the area / its lights, or a
   * carried light (visible avatars only: the visiting Storyteller's lantern is never drawn where you
   * cannot see them) — and all stamps go through ONE capture pass instead of one per stamp.
   */
  private updateLighting(dt: number) {
    const inside = this.me.location !== 'outdoors';
    const target = (inside ? AMBIENT_IN : AMBIENT_OUT)[this.phase] ?? 0xffffff;
    const k = 1 - Math.exp(-dt * 1.6);
    this.ambient.r += (((target >> 16) & 255) - this.ambient.r) * k;
    this.ambient.g += (((target >> 8) & 255) - this.ambient.g) * k;
    this.ambient.b += ((target & 255) - this.ambient.b) * k;
    const amb = (Math.round(this.ambient.r) << 16) | (Math.round(this.ambient.g) << 8) | Math.round(this.ambient.b);
    if (this.lightsDirty) this.rebuildLights();
    const night = NIGHT.has(this.phase);
    const dusk = this.phase === 'bedtime' || this.phase === 'dawn';
    const dim = night || dusk;
    // carried lights: [kind, x, y] per light, in stamping order
    const buf = this.carriedBuf;
    buf.length = 0;
    const carry = (av: Avatar, x: number, y: number) => {
      const kind = av.isST ? (av === this.myAvatar ? 2 : 1) : av.hasLantern ? 3 : av.ghost ? 4 : 0;
      if (kind) buf.push(kind, x, y);
    };
    for (const av of this.avatars.values()) if (av.sprite.visible) carry(av, av.sprite.x, av.sprite.y);
    if (this.myAvatar && this.ready) {
      carry(this.myAvatar, this.myAvatar.sprite.x, this.myAvatar.sprite.y);
      if (dim && !this.myAvatar.isST && !inside) buf.push(5, this.me.x, this.me.y);
    }
    const tick = this.areaLights.length ? Math.floor(this.time.now / FLICKER_MS) : 0;
    const lit = this.lit;
    if (lit.amb === amb && lit.tick === tick && lit.phase === this.phase && sameNumbers(lit.carried, buf)) return;
    lit.amb = amb;
    lit.tick = tick;
    lit.phase = this.phase;
    lit.carried.length = 0;
    for (const v of buf) lit.carried.push(v);

    const rt = this.lightRT;
    const a = this.area;
    const lampK = night ? 1 : dusk ? 0.8 : 0.28;
    // Windows glow at night identically for every cottage (nothing about who is home).
    const facadeK = night ? 0.95 : dusk ? 0.6 : 0;
    const ft = tick * FLICKER_MS;
    const flicker = (x: number) => 0.92 + 0.08 * Math.sin(ft / 130 + x * 0.37) * Math.sin(ft / 370 + x);
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    rt.clear();
    if (!webgl) rt.fill(amb, 1);
    rt.beginDraw();
    if (webgl) {
      // The ambient fill goes INTO the capture as an opaque quad: ADD (ONE, DST_ALPHA) onto an opaque
      // target is a plain sum, so batching every stamp in one pass gives the same pixels as the
      // per-stamp passes (fill, then each light added) — without a full-layer blit per light.
      const w = this.textures.getFrame('__WHITE');
      rt.stamp('__WHITE', undefined, 0, 0, { originX: 0, originY: 0, scaleX: rt.width / w.width, scaleY: rt.height / w.height, tint: amb, alpha: 1, skipBatch: true });
    }
    for (const l of this.areaLights) {
      const alpha = (l.mode === 0 ? l.k : l.mode === 1 ? facadeK * l.k : lampK * l.k) * flicker(l.seed);
      if (alpha > 0.01) this.stampLight(l.frame, l.x, l.y, l.scale, l.tint, alpha);
    }
    const carried = (x: number, y: number, r: number, color: number, alpha: number, frame: number) => {
      if (alpha <= 0.01) return;
      if (x + r < a.x || y + r < a.y || x - r > a.x + a.w || y - r > a.y + a.h) return;
      this.stampLight(frame, x - a.x, y - a.y, (r * 2) / 128, color, alpha);
    };
    for (let i = 0; i < buf.length; i += 3) {
      const x = buf[i + 1]!;
      const y = buf[i + 2]!;
      switch (buf[i]) {
        case 1:
        case 2:
          carried(x, y - 14, buf[i] === 2 && night ? 104 : 70, LIGHT_TINT.st!, dim ? 0.95 : 0.25, 0);
          break;
        case 3:
          carried(x, y - 12, 46, LIGHT_TINT.lantern!, dim ? 0.75 : 0.15, 1);
          break;
        case 4:
          carried(x, y - 14, 30, 0x9ad0e0, dim ? 0.45 : 0.15, 1);
          break;
        default:
          carried(x, y - 12, 44, 0x9aa4d8, 0.35, 1);
      }
    }
    rt.endDraw();
  }

  private stampLight(frame: number, x: number, y: number, scale: number, tint: number, alpha: number) {
    const c = this.stampCfg;
    c.scale = scale;
    c.tint = tint;
    c.alpha = alpha;
    this.lightRT.stamp('lights', frame, x, y, c);
  }

  /**
   * The fixed lights of the current area (on area / game-view changes): this location's lights
   * only, windows of empty cottages (no resident — public) dark, off-area lights culled.
   */
  private rebuildLights() {
    this.lightsDirty = false;
    this.lit.amb = -1; // force a pass
    const inside = this.me.location !== 'outdoors';
    const here = inside ? this.me.location.slice(4) : null;
    const a = this.area;
    const dark: { x: number; y: number; w: number; h: number }[] = [];
    if (!inside && this.gview)
      for (const d of this.doors) {
        const u = this.FX_HOUSES[d.b.id]?.unlit;
        if (u && !this.houseInUse(d.b)) dark.push({ x: u.wx - 2, y: u.wy - 2, w: u.w + 4, h: u.h + 4 });
      }
    const unlit = (x: number, y: number) => dark.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
    const out: AreaLight[] = [];
    for (const l of this.lightSrcs) {
      if (l.building !== here) continue;
      if (l.facade && dark.length && unlit(l.x, l.y)) continue;
      const mode = inside ? 0 : l.facade ? 1 : 2;
      const r = mode === 0 ? l.r * 1.3 : mode === 1 ? l.r : l.r * 0.85;
      if (l.x + r < a.x || l.y + r < a.y || l.x - r > a.x + a.w || l.y - r > a.y + a.h) continue;
      out.push({
        x: l.x - a.x,
        y: l.y - a.y,
        scale: (r * 2) / 128,
        tint: LIGHT_TINT[l.color] ?? LIGHT_TINT.warm!,
        frame: mode === 0 ? 1 : 0,
        mode,
        k: mode === 0 ? (l.color === 'fire' ? 0.85 : 0.6) : mode === 1 ? 0.7 : 0.8,
        seed: mode === 0 ? l.x : mode === 1 ? l.y : l.x + l.y,
      });
    }
    this.areaLights = out;
  }
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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

/** The outdoor camera zoom for a w x h canvas: the square's preset view (circle + clock face) fits. */
export function outdoorZoom(w: number, h: number, view: { w: number; h: number } = SQUARE_VIEW_V2): number {
  return Math.max(0.2, Math.min(w / view.w, h / view.h));
}

/** Spawn-free helper used before the first server position arrives (the current lobby's layout). */
export const squareCenter = () => {
  const L = currentLayout();
  return tileCenterPx(L, L.playerSpawn);
};
