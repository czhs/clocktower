// v3 WP2 (v3-avatars). The avatar layer: every player (own + remote) and the cosmetic townsfolk, drawn as
// pixel3d rigs or v2-sprite billboards (docs/v3/INTEGRATION.md §3 rows "Own avatar", "Remote avatars", "Ghosts,
// deaths", "Phases ... raised hands", "Carried lanterns", "NPCs"; §4). Implements Layer3d + AvatarRegistry.
//
//   createAvatarLayer(svc) -> AvatarLayer        a LayerFactory (TownGame3d LAYERS) with optional extra services;
//                                                layer.registry is the AvatarRegistry (WP4 overlays, WP1 picks)
//
// Per frame (update, after net/ wrote Scene3dState):
//   1. sync entries with state.me / state.remotes / state.members (cast id changes rebuild the body);
//   2. start at most ONE build (queue.ts: own first, then by distance; one in flight); a failed rig falls back
//      to the tinted `wanderer` stand-in, then to a billboard (castMap.ts);
//   3. per entry: shown only in the viewer's location; feet = the pose px through coords.ts (no clamp); jumps
//      (> ST_JUMP_PX, location change, first placement) reset the track (no slide; WP4 draws the poof);
//      deaths (clips.ts stepDeath: 'die' held 1.5 s when seen) -> the ghost look of the body's GhostMode;
//      raised hands -> held 'vote'; lanterns at night borrow a pool light (lanterns.ts; living carriers and the
//      Storyteller only, as v2); low tier: LOD > 12 m; body.update(t) only for shown bodies.
// A landed build is pre-compiled (renderer.compile into a scratch render target, so the variants match the
// pipeline's render-target passes, then a guarded, cancellable readiness poll: precompile.ts) and stays hidden until
// that resolves: no synchronous compile hitch on its first
// draw for a player who joins mid-game. A revived 'clips' ghost leaves its slide in place (rigBody.ts), no rebuild.
// The per-frame path reuses its containers (no per-frame Sets / Maps / closures / anchor objects).
// Coordinates crossing the layer boundary are v2 px + LocationId (contract.ts); metres stay inside.
import { ST_JUMP_PX } from '../../game/rules/movement';
import type { Facing, LocationId } from '@ct/protocol';
import * as THREE from 'three';
import type { Anchor3d, AvatarDebug, AvatarRegistry, Layer3d, Pose, Px, Scene3dState, Tier, View3d } from '../contract';
import { preloadSpecs } from '../vendor/characters';
import type { AvatarBody, BodyFrameCtx } from './body';
import { createBillboardBody, hasBillboardArt, releaseBillboardSheets } from './billboard';
import { carriesLantern, castMap, fallbackCastId, STANDIN_SPEC, standinTint } from './castMap';
import { ghostLevel, newDeathState, raisedHands, resolveEmote, stepDeath, wantClips, type ClipInputs, type ClipWant, type DeathState } from './clips';
import { syncLantern, lanternHour, type LanternSlot, type LightAnchorFn, type LightPool } from './lanterns';
import { createNpcFolk, DAYLIKE, npcHomesFor, type Npc, type NpcFolk } from './npcs';
import { fallbackView, pxToMetres } from './project';
import { nextBuild, type BuildCandidate } from './queue';
import { createRigBody } from './rigBody';
import type { SpriteSheet } from './sprites/bake';

type SpriteMod = typeof import('./sprites/index');
import { canPrecompile, precompile, type CompileRendererLike, type PrecompileResult } from './precompile';
import { RIM_DEFAULT } from './ghostTint';
import { dir8, toFacing } from '../../game/rules/input';
import { LOW_TIER_AMBIENCE } from '../../game/fx/tier';

/**
 * v3.3: characters are baked sprites (sprites/) at the `low` tier; rigs at `high` and `cpu` (software GL: every spec's
 * bake + sprite programs compile for seconds there, a cold join took 118 s on SwiftShader; docs/perf-v3/sprites.md §5).
 * localStorage['ct.debug.v3sprites'] = '1' | '0' forces sprites on / off at any tier; a test build can force it for
 * every client (VITE_V3SPRITES=1 | 0 at build time: the e2e runs of both paths).
 * v3.4: a new avatar shows its RIG first unless its sheet is already at hand (a finished sheet or the IndexedDB cache:
 * peekSheet); the sheet then bakes in the background (BAKE_BUDGET_MS per frame) and the body is swapped to a sprite
 * once the sheet and the sprite's programs are ready (`upgrade`), so a cold join is as fast as with rigs. Bakes AND
 * cached sheets wait for `spriteGate` (TownGame3d: no low -> high promotion pending: 'high' draws rigs, so the GPU probe
 * must time rigs, and a promoted town rebuilds anyway).
 */
export function spritesDefault(tier: Tier, flag: string | null | undefined, buildFlag?: string | null): boolean {
  if (buildFlag === '1' || buildFlag === '0') return buildFlag === '1';
  if (flag === '1' || flag === '0') return flag === '1';
  return tier === 'low';
}
export function spritesEnabled(tier: Tier): boolean {
  let flag: string | null = null;
  try {
    flag = globalThis.localStorage?.getItem('ct.debug.v3sprites') ?? null;
  } catch {
    flag = null;
  }
  return spritesDefault(tier, flag, (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_V3SPRITES ?? null);
}

/** Low tier: characters farther than this from the camera target skip the normal pass and cast no shadow (§4). */
export const LOD_FAR_M = 12;
/** A pid missing from `members` waits this long for its cast id before the pid-hash stand-in id is used. */
export const CAST_WAIT_MS = 2000;
/** Teleport cross-fade length (s). */
export const FADE_S = 0.12;
/** anchorOf().headTopCss sits this far above the drawn head (m): WP4 stacks the name label on it (anchors.ts). */
export const HEAD_PAD_M = 0.1;
/** v3.4: pause between two background kit builds after a cached join (ms): spreads the vendor's synchronous rig builds. */
export const KIT_WARM_GAP_MS = 1500;
/** A landed body stays hidden at most this long while its shaders pre-compile (ms). */
export const PREWARM_MAX_MS = 3000;

/** The spec module to preload for a cast id (billboards have none; unknown ids load the stand-in). */
export function preloadIdOf(castId: string): string | null {
  const cm = castMap(castId);
  if (cm.fallback === 'billboard') return null;
  return cm.spec ?? STANDIN_SPEC;
}

/** Structurally a TownGame3d Layer3dServices ({engine, bridge, tier}) plus the optional services WP2 can use. */
export interface AvatarServices {
  engine: unknown;
  tier: Tier;
  /** Town ground height (m) outdoors; interiors are flat at y = 0. Default: flat 0. */
  heightAt?: (X: number, Z: number) => number;
  /** Room floor height (m) at a world point inside a room (x >= 100 m: the clock tower's stair / landing). Default 0. */
  floorAt?: (X: number, Z: number) => number;
  /** WP1's view (anchors, picks). Default: a projection-only view over the engine camera (project.ts). */
  view?: View3d;
  /** WP3's constant light pool, for carried lanterns. Absent = lanterns stay dark. */
  lights?: LightPool | null;
  /** Draw the viewer's own avatar (default true). */
  self?: boolean;
  /** Cosmetic townsfolk (default true). */
  npcs?: boolean;
  /** v3.4: sprites (bakes and cached sheets) may be used (default: always). */
  spriteGate?: () => boolean;
}

/** contract.ts AvatarRegistry + `isShown` (WP4's CONTRACT-REQUEST; overlay/types.ts `avatarShown` default). */
export interface AvatarRegistry3d extends AvatarRegistry {
  /** The avatar of `pid` is drawn in the viewer's location this frame (has a body, is shown), on screen or not. */
  isShown(pid: string): boolean;
}

export interface AvatarLayer extends Layer3d {
  /** anchorOf / pidAt / debug(pid) / isShown over the drawn avatars (contract.ts AvatarRegistry). */
  readonly registry: AvatarRegistry3d;
  /** Play a game emote / safe clip on a player's avatar (clips.ts fallback chain); false if nothing plays. */
  playEmote(pid: string, name: string): boolean;
  /**
   * Voice: while a player talks, hold the 'talk' loop (living rigs with a talk clip only) and light the
   * emissive talking rim (§3 "Talking outline" interim; WP4's request, driven by the composition root from
   * voicePresence + readTalkOutlineMode). `rim`: a CSS hex colour, undefined = RIM_DEFAULT, null = no rim
   * (clip only). Uniforms only: no program change.
   */
  setTalking(pid: string, on: boolean, rim?: string | null): void;
  /**
   * Resolves once the own avatar has a body (or could not get one), or the layer is destroyed; with `timeoutMs`,
   * at the latest after that long (a stalled spec import must not block the mount; the avatar appears later).
   */
  selfReady(timeoutMs?: number): Promise<void>;
  /** Whether every known player has a body or has definitively failed (warm-up / tests). */
  settled(): boolean;
  /**
   * Cross-fade an avatar in over FADE_S at its new spot (§3 "Own avatar": a teleport with reason ≠ 'correction';
   * wire to WP1 core.on('placed') for the own pid and to Storyteller poofs for remotes).
   */
  fadeIn(pid: string): void;
}

interface PoseLike {
  x: number;
  y: number;
  location: LocationId;
  facing: Facing;
  moving: boolean;
}

interface Entry {
  key: string;
  pid: string | null;
  npc: Npc | null;
  self: boolean;
  castId: string;
  firstSeen: number;
  body: AvatarBody | null;
  building: boolean;
  gen: number;
  failed: boolean;
  pose: PoseLike;
  /** last placement (px + location) for jump detection; null = next placement jumps */
  placed: { x: number; y: number; location: LocationId } | null;
  shown: boolean;
  death: DeathState;
  dead: boolean;
  ghostVote: boolean;
  /** what setGhost last applied: null = not yet */
  appliedGhost: string | null;
  lantern: LanternSlot;
  lanternAnchor: LightAnchorFn;
  carriesLantern: boolean;
  /** standin colour when the body is the tinted stand-in */
  tint: string | null;
  removed: boolean;
  /** an NPC that is not out right now (night, indoors viewer, beyond the low-tier count) */
  parked: boolean;
  /** build token while a build of this entry is in flight */
  token: number;
  /** the rim colour last applied to the body ('' = none / not yet) */
  rim: string;
  /** a Storyteller (keeps a lantern lit whatever happens) */
  storyteller: boolean;
  /** the landed body is pre-compiling (kept hidden) */
  compiling: boolean;
  /** reused per frame */
  want: ClipWant;
  anchor: Anchor3d;
  /** v3.4 rig -> sprite upgrade: 0 none yet, 1 sheet requested, 2 sprite body compiling, 3 done / not applicable */
  upgrade: 0 | 1 | 2 | 3;
  /** the upgrade's sprite body while it compiles (hidden; the rig stays shown) */
  next: AvatarBody | null;
  /** dying this frame (no swap mid-collapse) */
  dying: boolean;
}

interface PubRecord {
  alive: boolean;
  ghost: boolean;
  /** frame stamp: stale records (players gone from the game view) are ignored */
  n: number;
}

const FACE_YAW: Record<Facing, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

/** Bytes of the geometry under a body (debug: the rig path's avatar GPU memory estimate). */
function geometryBytesOf(root: THREE.Object3D): number {
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) geos.add(m.geometry);
  });
  let n = 0;
  for (const g of geos) {
    if (g.index) n += (g.index.array as unknown as { byteLength: number }).byteLength;
    const seen = new Set<unknown>();
    for (const a of Object.values(g.attributes)) {
      const arr = (a as THREE.BufferAttribute & { data?: { array: unknown } }).data?.array ?? (a as THREE.BufferAttribute).array;
      if (seen.has(arr)) continue;
      seen.add(arr);
      n += (arr as unknown as { byteLength: number }).byteLength;
    }
  }
  return n;
}

interface RendererLike {
  /** three's compile() + properties (precompile.ts); never three's compileAsync, whose poll throws on a disposed material */
  compile?: CompileRendererLike['compile'];
  properties?: CompileRendererLike['properties'];
  getRenderTarget?(): THREE.WebGLRenderTarget | null;
  setRenderTarget?(rt: THREE.WebGLRenderTarget | null): void;
  info?: { programs?: unknown[] | null };
}
interface EngineLike {
  scene: THREE.Scene | null;
  camera: { cam: THREE.Camera; target: THREE.Vector3 } | null;
  renderer?: RendererLike | null;
}

export function createAvatarLayer(svc: AvatarServices): AvatarLayer {
  const engine = svc.engine as EngineLike;
  const heightAt = svc.heightAt ?? (() => 0);
  /** Feet height: the town terrain outdoors; interiors (x ≥ 100 m, origins at 200 + 30 i) are flat, except the clock
   *  tower's room (x 650: its stair and 1.1 m landing, `floorAt`). */
  const floorAt = svc.floorAt;
  const groundAt = (X: number, Z: number) => (X >= 100 ? (floorAt ? floorAt(X, Z) : 0) : heightAt(X, Z));
  const drawSelf = svc.self !== false;
  const lite = svc.tier !== 'high'; // 'low' and 'cpu' (v3 perf cpu)
  const entries = new Map<string, Entry>();
  /** pid -> rim colour ('' = talking without a rim) */
  const talking = new Map<string, string>();
  /** pid -> fade start (engine s); NaN = start on the next frame */
  const fades = new Map<string, number>();
  const raised = new Set<string>();
  const brianbis: { x: number; y: number }[] = [];
  let layoutRef: Scene3dState['layout'] | null = null;
  let view: (View3d & { frame?(): void }) | null = svc.view ?? null;
  let folk: NpcFolk | null = null;
  let folkWorld: string | null = null;
  /** folk.list[i]'s entry */
  const folkEntries: (Entry | undefined)[] = [];
  /** token of the one build in flight (0 = none) */
  let inFlight = 0;
  let tokens = 0;
  let destroyed = false;
  let lastT = 0;
  let viewerLoc: LocationId = 'outdoors';
  let selfResolve: (() => void) | null = null;
  const selfP = new Promise<void>((r) => (selfResolve = r));
  const camQuat = new THREE.Quaternion();
  /** Scratch for lantern anchors (the pool copies it out at once). */
  const lanternAt = new THREE.Vector3();
  // per-frame scratch (no allocations on the hot path)
  const seen = new Set<string>();
  const pub = new Map<string, PubRecord>();
  let frameNo = 0;
  const ctx: BodyFrameCtx = { still: false, camQuat };
  const metres = { X: 0, Z: 0 };
  const clipIn: ClipInputs = { dying: false, handUp: false, dead: false, ghostMode: 'tint', ghostVoteAvailable: true, talking: false, clips: [], emotes: {} };
  /** scratch render target for the pre-warm (created on first use) */
  let warmRT: THREE.WebGLRenderTarget | null = null;
  const warm = { builds: 0, compiled: 0, timedOut: 0, misses: 0, unchecked: 0, ms: 0 };
  /** bumped by every pre-warm: a miss check is only meaningful when no other pre-warm compiled in between */
  let warmSeq = 0;

  const doneSelf = () => {
    selfResolve?.();
    selfResolve = null;
  };

  const newEntry = (key: string, pid: string | null, npc: Npc | null, self: boolean, castId: string, pose: PoseLike): Entry => {
    const e: Entry = {
      key,
      pid,
      npc,
      self,
      castId,
      firstSeen: performance.now(),
      body: null,
      building: false,
      gen: 0,
      failed: false,
      pose: { ...pose },
      placed: null,
      shown: false,
      death: newDeathState(),
      dead: false,
      ghostVote: true,
      appliedGhost: null,
      lantern: { lease: null },
      lanternAnchor: () => (e.body && e.shown && e.body.lanternAnchor(lanternAt) ? lanternAt : null),
      carriesLantern: carriesLantern(castId),
      tint: null,
      removed: false,
      parked: false,
      token: 0,
      rim: '',
      storyteller: false,
      compiling: false,
      want: { action: null, loop: null },
      anchor: { feet: { x: 0, y: 0 }, displayFeet: { x: 0, y: 0 }, headTopCss: { x: 0, y: 0 }, heightM: 0 },
      upgrade: 0,
      next: null,
      dying: false,
    };
    return e;
  };

  const dropBody = (e: Entry) => {
    // an in-flight build for this entry is discarded when it lands; `inFlight` stays set until it settles (its
    // .finally clears it), so a second build never runs beside the discarded one
    e.gen++;
    e.building = false;
    e.compiling = false;
    if (e.lantern.lease) {
      e.lantern.lease.release();
      e.lantern.lease = null;
    }
    e.body?.dispose();
    e.body = null;
    e.next?.dispose();
    e.next = null;
    e.upgrade = 0;
    e.appliedGhost = null;
    e.placed = null;
    e.tint = null;
    e.rim = '';
  };

  // ------------------------------------------------------------------ builds
  type Attempt = { kind: 'rig' | 'sprite'; spec: string; tint: string | null } | { kind: 'billboard'; id: string; tint: string | null };
  const sprites = spritesEnabled(svc.tier);
  /** the sprite chunk (loaded only when sprites are on; nothing sprite-related runs before it is here) */
  let S: SpriteMod | null = null;
  const spriteMod: Promise<SpriteMod | null> | null = sprites
    ? import('./sprites/index').then(
        (m) => (S = m),
        (err) => {
          console.warn('[avatars] sprite module unavailable, keeping rigs', err);
          return null;
        },
      )
    : null;
  const gateOpen = () => {
    try {
      return svc.spriteGate?.() ?? true;
    } catch {
      return true;
    }
  };
  /** An attempt that only takes a sheet already at hand (else the next attempt: the rig, upgraded later). */
  const NOT_READY = 'sprite sheet not ready';
  const attemptsFor = (e: Entry): Attempt[] => {
    const cm = castMap(e.castId);
    const pinTint = standinTint(e.pid ?? e.key);
    const standin: Attempt = { kind: 'rig', spec: STANDIN_SPEC, tint: pinTint };
    const out: Attempt[] = [];
    const standinSprite: Attempt = { kind: 'sprite', spec: STANDIN_SPEC, tint: pinTint };
    if (cm.spec && sprites) out.push({ kind: 'sprite', spec: cm.spec, tint: null });
    if (cm.spec) out.push({ kind: 'rig', spec: cm.spec, tint: null });
    if (cm.fallback === 'billboard' && hasBillboardArt(e.castId)) out.push({ kind: 'billboard', id: e.castId, tint: null });
    if (sprites) out.push(standinSprite);
    out.push(standin);
    if (cm.fallback !== 'billboard' && hasBillboardArt(e.castId)) out.push({ kind: 'billboard', id: e.castId, tint: null });
    return out;
  };

  const startBuild = (e: Entry) => {
    const token = ++tokens;
    inFlight = token;
    e.token = token;
    e.building = true;
    const gen = ++e.gen;
    const m = layoutRef ? pxToMetres(layoutRef, e.pose, e.pose.location) : null;
    const at = m ?? { X: 0, Z: 0 };
    const face = FACE_YAW[e.pose.facing] ?? 0;
    const attempts = attemptsFor(e);
    const run = async (): Promise<{ body: AvatarBody; tint: string | null } | null> => {
      for (const a of attempts) {
        try {
          if (a.kind === 'sprite') {
            // not before the gate: the promotion probe must time the rigs ('high' would draw rigs; sprites at low cost
            // ~half the GPU time and would let an integrated GPU pass the 4.5 ms bar)
            if (!gateOpen() || !S) throw new Error(NOT_READY);
            const sheet = await S.peekSheet(engine as object, a.spec, S.sheetCameraOf(engine));
            if (!sheet) throw new Error(NOT_READY);
            const body = await S.createSpriteBody(engine, a.spec, { x: at.X, z: at.Z, face, heightAt: groundAt, tint: a.tint, prio: e.self ? 10 : 0, lantern: e.carriesLantern, sheet });
            return { body, tint: a.tint };
          }
          if (a.kind !== 'billboard') {
            const body = await createRigBody(engine, a.spec, { x: at.X, z: at.Z, face, heightAt: groundAt, lite, tint: a.tint, lantern: e.carriesLantern });
            return { body, tint: a.tint };
          }
          const body = await createBillboardBody(engine as object, a.id, { heightAt: groundAt, tint: a.tint });
          return { body, tint: a.tint };
        } catch (err) {
          if (destroyed || e.removed || gen !== e.gen) return null;
          if ((err as Error)?.message === NOT_READY) continue;
          console.warn(`[avatars] ${a.kind} '${a.kind !== 'billboard' ? a.spec : a.id}' for cast '${e.castId}' failed:`, (err as Error)?.message ?? err);
        }
      }
      return null;
    };
    run()
      .then((r) => {
        if (destroyed || e.removed || gen !== e.gen) {
          r?.body.dispose();
          return;
        }
        e.building = false;
        if (!r) {
          e.failed = true;
          return;
        }
        e.body = r.body;
        e.tint = r.tint;
        // a rig of a real spec while sprites are on: upgraded once its sheet is baked (layer.update -> pumpUpgrades)
        e.upgrade = sprites && r.body.kind === 'rig' && r.body.specId && !r.body.texture.startsWith('v3-sprite:') ? 0 : 3;
        e.placed = null;
        e.appliedGhost = null;
        e.rim = '';
        r.body.holder.visible = false; // shown by an update once placed (and pre-compiled)
        engine.scene?.add(r.body.holder);
        prewarm(e, r.body);
      })
      .catch((err) => {
        e.building = false;
        e.failed = true;
        console.warn('[avatars] build failed', err);
      })
      .finally(() => {
        if (inFlight === token) inFlight = 0;
        if (e.self && (e.body || e.failed)) doneSelf();
      });
  };

  /**
   * Compile the new body's programs before its first draw (renderer.compile, then a readiness poll that is parallel
   * where the browser has KHR_parallel_shader_compile), into a scratch render target: the pipeline draws the scene
   * into render targets, so the variants match (linear output, no tone mapping) instead of adding canvas variants.
   * The entry stays hidden until it resolves (at most PREWARM_MAX_MS). The poll stops when the body is dropped, the
   * layer is destroyed or the deadline passes, and treats a released material as done (precompile.ts: three's own
   * compileAsync poll threw "reading 'isReady'" from a timer for a body disposed mid-compile).
   */
  const prewarm = (e: Entry, body: AvatarBody, onDone?: (current: boolean) => void) => {
    const r = engine.renderer;
    const cam = engine.camera?.cam;
    const scene = engine.scene;
    if (!r || !canPrecompile(r) || !r.setRenderTarget || !r.getRenderTarget || !cam || !scene) {
      onDone?.(true);
      return;
    }
    warm.builds++;
    warmSeq++;
    const gen = e.gen;
    const t0 = performance.now();
    let p: Promise<PrecompileResult> | null = null;
    const prev = r.getRenderTarget();
    try {
      warmRT ??= new THREE.WebGLRenderTarget(1, 1);
      r.setRenderTarget(warmRT);
      // compiles synchronously inside the call; only the poll is asynchronous
      p = precompile(r, body.compileRoots?.() ?? [body.holder], cam, scene, { live: () => !destroyed && e.gen === gen, maxMs: PREWARM_MAX_MS });
    } catch (err) {
      console.warn('[avatars] shader pre-warm failed', err);
    } finally {
      r.setRenderTarget(prev);
    }
    if (!p) {
      onDone?.(e.gen === gen);
      return;
    }
    // an upgrade compiles beside the shown rig (onDone swaps); a first build stays hidden while it compiles
    if (!onDone) e.compiling = true;
    p.then((v) => {
      if (v === 'timeout') warm.timedOut++;
      else if (v === 'ready') warm.compiled++;
      warm.ms += performance.now() - t0;
      if (onDone) onDone(e.gen === gen);
      else if (e.gen === gen) {
        e.compiling = false;
        warmCheck.set(e, { n: programCount(), seq: warmSeq });
      }
    }).catch(() => onDone?.(false));
  };
  const programCount = () => engine.renderer?.info?.programs?.length ?? 0;
  /**
   * entry -> program count (and pre-warm sequence) when its pre-warm ended; checked once after its first drawn frame
   * (debug: misses). Another pre-warm in between makes the count meaningless: `unchecked`.
   */
  const warmCheck = new Map<Entry, { n: number; seq: number }>();

  // ------------------------------------------------------------------ v3.4 rig -> sprite upgrades
  const ups = { requested: 0, swapped: 0, failed: 0, firstAt: 0, lastAt: 0, kitsWarmed: 0 };
  let kitWarm = false;
  let kitWarmAt = 0;
  /** the one upgrade whose sprite body is being created / compiled (spreads the programs' compiles) */
  let upBusy = false;
  let upEntry: Entry | null = null;
  /** entries whose sheet is ready, waiting for their body (one at a time, in landing order) */
  const upReady: { e: Entry; gen: number; sheet: SpriteSheet }[] = [];
  const pumpUpgrades = (me: Px | null) => {
    if (!sprites || destroyed || !S) return;
    const M = S;
    // the first builds go first (a join is as fast as with rigs): no upgrade while a body is still to be built
    if (inFlight !== 0) return;
    for (const e of entries.values()) if (!e.body && !e.failed && !e.removed && !e.parked) return;
    let gate: boolean | null = null;
    // 1. request the sheets (the store bakes them in priority order: own avatar, then the nearest, townsfolk last)
    for (const e of entries.values()) {
      if (e.upgrade !== 0 || !e.body || e.building || e.removed || !e.body.specId) continue;
      gate ??= gateOpen();
      if (!gate) return;
      e.upgrade = 1;
      ups.requested++;
      const gen = e.gen;
      const here = e.pose.location === viewerLoc;
      const dist = me && here ? Math.hypot(e.pose.x - me.x, e.pose.y - me.y) : 1e4;
      const prio = e.self ? 10 : e.npc ? -1 : here ? 5 - Math.min(4, dist / 400) : 0;
      M.getSheet(engine as object, e.body.specId, M.sheetCameraOf(engine), prio).then(
        (sheet) => {
          if (destroyed || e.removed || gen !== e.gen) return;
          sheet.refs++; // held until the body takes it (or the upgrade is dropped)
          upReady.push({ e, gen, sheet });
        },
        (err) => {
          if (destroyed || gen !== e.gen) return;
          e.upgrade = 3;
          ups.failed++;
          console.warn(`[avatars] sprite bake for '${e.castId}' failed, keeping the rig:`, (err as Error)?.message ?? err);
        },
      );
    }
    // 3. (when nothing else is open) kits for the specs whose sheets came from the cache: one at a time, a pause
    //    between, so the first vote camera re-bake only renders cells (no rig build / compile during the vote)
    if (!upBusy && !upReady.length && !kitWarm && performance.now() > kitWarmAt) {
      let open = false;
      let want: string | null = null;
      for (const e of entries.values()) {
        if (e.upgrade === 1 || e.upgrade === 2) open = true;
        else if (!want && e.body?.specId && e.body.texture.startsWith('v3-sprite:') && !M.hasKit(engine as object, e.body.specId)) want = e.body.specId;
      }
      if (!open && want) {
        kitWarm = true;
        M.warmKit(engine as object, want)
          .catch((err) => console.warn(`[avatars] sprite kit '${want}' failed`, (err as Error)?.message ?? err))
          .finally(() => {
            kitWarm = false;
            kitWarmAt = performance.now() + KIT_WARM_GAP_MS;
            ups.kitsWarmed++;
          });
      }
    }
    // 2. one sprite body at a time: create, pre-compile beside the shown rig, then swap
    if (upBusy || !upReady.length) return;
    const job = upReady.shift()!;
    const { e, gen, sheet } = job;
    const unhold = () => M.releaseSheet(engine as object, sheet);
    if (destroyed || e.removed || gen !== e.gen || !e.body) return unhold();
    upBusy = true;
    upEntry = e;
    e.upgrade = 2;
    const m = layoutRef ? pxToMetres(layoutRef, e.pose, e.pose.location) : null;
    const at = m ?? { X: 0, Z: 0 };
    M.createSpriteBody(engine, e.body.specId!, { x: at.X, z: at.Z, face: FACE_YAW[e.pose.facing] ?? 0, heightAt: groundAt, tint: e.tint, prio: e.self ? 10 : 0, lantern: e.carriesLantern, sheet })
      .then((nb) => {
        unhold();
        if (destroyed || e.removed || gen !== e.gen || !e.body) {
          nb.dispose();
          upBusy = false;
          upEntry = null;
          return;
        }
        e.next = nb;
        nb.holder.visible = false;
        engine.scene?.add(nb.holder);
        // swapped by a later update once compiled (between frames, never mid-collapse / mid-fade)
        prewarm(e, nb, () => {
          upBusy = false;
          upEntry = null;
        });
      })
      .catch((err) => {
        unhold();
        upBusy = false;
        upEntry = null;
        if (gen !== e.gen) return;
        e.upgrade = 3;
        ups.failed++;
        console.warn(`[avatars] sprite body for '${e.castId}' failed, keeping the rig:`, (err as Error)?.message ?? err);
      });
  };
  /** Swap a compiled upgrade in (called per entry from the body loop, before the entry's frame). */
  const swapUpgrade = (e: Entry) => {
    const nb = e.next;
    if (!nb) return;
    if (e.dying || (e.pid && fades.has(e.pid))) return;
    e.next = null;
    e.upgrade = 3;
    e.body?.dispose();
    e.body = nb;
    e.placed = null;
    e.appliedGhost = null;
    e.rim = '';
    ups.swapped++;
    const now = Math.round(performance.now());
    if (!ups.firstAt) ups.firstAt = now;
    ups.lastAt = now;
  };

  const cands: (BuildCandidate & { e: Entry })[] = [];
  const pumpQueue = (me: Px | null) => {
    if (inFlight !== 0 || destroyed) return;
    cands.length = 0;
    const now = performance.now();
    for (const e of entries.values()) {
      if (e.body || e.building || e.failed || e.removed || e.parked) continue;
      // a player without a cast id yet waits a little for the lobby view (no wrong first build)
      if (e.pid && !e.npc && e.castId === '' && now - e.firstSeen < CAST_WAIT_MS) continue;
      if (e.castId === '') e.castId = fallbackCastId(e.pid ?? e.key);
      const here = e.pose.location === viewerLoc;
      const dist = me && here ? Math.hypot(e.pose.x - me.x, e.pose.y - me.y) : Infinity;
      cands.push({ key: e.key, self: e.self, npc: !!e.npc, here, dist, e });
    }
    const next = nextBuild(cands);
    if (next) startBuild(next.e);
  };

  // ------------------------------------------------------------------ npcs
  const ensureFolk = (state: Scene3dState) => {
    if (svc.npcs === false || folkWorld === state.world) return;
    folkWorld = state.world;
    const layout = state.layout;
    npcHomesFor(state.world)
      .then((homes) => {
        if (destroyed || folkWorld !== state.world) return;
        folk = createNpcFolk(layout, state.world, homes);
        folkEntries.length = 0;
        for (const n of folk.list) {
          const key = `npc:${n.id}`;
          if (!entries.has(key)) entries.set(key, newEntry(key, null, n, false, n.id, { x: n.x, y: n.y, location: 'outdoors', facing: 'down', moving: false }));
          folkEntries.push(entries.get(key));
        }
      })
      .catch((err) => console.warn('[avatars] townsfolk unavailable', err));
  };

  // ------------------------------------------------------------------ per frame
  const upsertPlayer = (state: Scene3dState, pid: string, p: Pose, self: boolean) => {
    seen.add(pid);
    const look = state.members.get(pid);
    const castId = look?.castId ?? '';
    let e = entries.get(pid);
    if (!e) {
      e = newEntry(pid, pid, null, self, castId, p);
      entries.set(pid, e);
      preload(castId);
    } else if (castId && castId !== e.castId) {
      // a new character pick (or the cast id arriving after the pid-hash stand-in): rebuild
      const hadBody = !!e.body || e.building;
      e.castId = castId;
      e.carriesLantern = carriesLantern(castId);
      e.failed = false;
      if (hadBody) dropBody(e);
      preload(castId);
    }
    e.self = self;
    e.pose.x = p.x;
    e.pose.y = p.y;
    e.pose.location = p.location;
    e.pose.facing = p.facing;
    e.pose.moving = p.moving;
    e.storyteller = look?.role === 'storyteller';
    if (e.storyteller) e.carriesLantern = true;
  };
  const preloadOne: string[] = [''];
  const preload = (castId: string) => {
    const id = castId ? preloadIdOf(castId) : null;
    if (!id) return;
    preloadOne[0] = id;
    preloadSpecs(preloadOne);
  };

  const placeEntry = (e: Entry, t: number) => {
    const body = e.body!;
    const m = layoutRef ? pxToMetres(layoutRef, e.pose, e.pose.location, metres) : null;
    if (!m) return false;
    const pl = e.placed;
    const jump = !pl || pl.location !== e.pose.location || Math.hypot(pl.x - e.pose.x, pl.y - e.pose.y) > ST_JUMP_PX;
    const face = e.pose.moving ? null : (FACE_YAW[e.pose.facing] ?? null);
    body.place(t, m.X, m.Z, face, e.pose.moving, jump);
    if (!pl) e.placed = { x: e.pose.x, y: e.pose.y, location: e.pose.location };
    else {
      pl.x = e.pose.x;
      pl.y = e.pose.y;
      pl.location = e.pose.location;
    }
    if (lite && engine.camera) {
      const dx = m.X - engine.camera.target.x;
      const dz = m.Z - engine.camera.target.z;
      body.setLod(e.pose.location === 'outdoors' && Math.hypot(dx, dz) > LOD_FAR_M);
    }
    return true;
  };

  const layer: AvatarLayer = {
    update(state, t, dt) {
      if (destroyed) return;
      lastT = t;
      layoutRef = state.layout;
      if (!view) view = fallbackView(engine, state.layout, () => heightAt);
      view.frame?.();
      viewerLoc = state.me?.location ?? 'outdoors';
      ensureFolk(state);
      // sprite bakes: a slice of work per frame (BAKE_BUDGET_MS), before this frame's render
      if (S) S.pumpBakes(engine as object);

      // 1. players
      seen.clear();
      if (drawSelf && state.me && state.myPid) upsertPlayer(state, state.myPid, state.me, true);
      for (const [pid, p] of state.remotes) if (pid !== state.myPid) upsertPlayer(state, pid, p, false);
      for (const e of entries.values()) {
        // (deleting the current key while iterating a Map is safe)
        if (e.npc || seen.has(e.key)) continue;
        e.removed = true;
        dropBody(e);
        warmCheck.delete(e);
        entries.delete(e.key);
      }

      // 2. game state
      const n = ++frameNo;
      for (const p of state.game?.players ?? []) {
        let r = pub.get(p.pid);
        if (!r) pub.set(p.pid, (r = { alive: true, ghost: true, n }));
        r.alive = p.alive;
        r.ghost = p.ghostVoteAvailable;
        r.n = n;
      }
      raisedHands(state.game, raised);
      const night = lanternHour(state.hour);
      const day = DAYLIKE.has(state.phase);

      // 3. townsfolk steering (only what this viewer sees outdoors)
      if (folk) {
        brianbis.length = 0;
        if (day && viewerLoc === 'outdoors')
          for (const e of entries.values()) if (!e.npc && e.castId === 'brianbi' && e.shown && e.pose.location === 'outdoors') brianbis.push(e.pose);
        const active = day && viewerLoc === 'outdoors' ? (lite ? LOW_TIER_AMBIENCE.townsfolk : folk.list.length) : 0;
        folk.step(dt, performance.now(), brianbis, active);
        for (let i = 0; i < folk.list.length; i++) {
          const nn = folk.list[i]!;
          const e = folkEntries[i];
          if (!e) continue;
          e.pose.x = nn.x;
          e.pose.y = nn.y;
          e.pose.moving = Math.hypot(nn.dx, nn.dy) > 0.01;
          if (e.pose.moving) e.pose.facing = toFacing(dir8(nn.dx, nn.dy), nn.dx, nn.dy); // an idle NPC keeps its last heading
          // out only while active (never at night / for an indoor viewer / beyond the low-tier count)
          e.parked = i >= active;
        }
      }

      // 4. builds (then the rig -> sprite upgrades)
      pumpQueue(state.me);
      pumpUpgrades(state.me);

      // 5. bodies
      const cam = engine.camera?.cam;
      if (cam) camQuat.copy(cam.quaternion);
      ctx.still = state.reducedMotion;
      for (const e of entries.values()) {
        const rec = e.pid ? pub.get(e.pid) : undefined;
        const p = rec && rec.n === n ? rec : undefined;
        e.dead = !!p && !p.alive;
        e.ghostVote = p ? p.ghost : true;
        const here = !e.parked && e.pose.location === viewerLoc;
        // a compiled sprite upgrade replaces the rig (not mid-collapse / mid-fade: `dying` is last frame's)
        if (e.next && e.upgrade === 2 && upEntry !== e) swapUpgrade(e);
        const body = e.body;
        const dying = stepDeath(e.death, e.dead, here && !!body && e.shown, !!body?.emotes.die, t);
        e.dying = dying;
        if (!body) {
          e.shown = false;
          continue;
        }
        // ghost look (after the collapse); a revived 'clips' ghost leaves its slide in place (rigBody.ts)
        const ghostKey = e.dead && !dying ? (e.ghostVote ? 'dead:1' : 'dead:2') : 'alive';
        if (ghostKey !== e.appliedGhost) {
          body.setGhost(ghostKey !== 'alive', ghostLevel(e.ghostVote));
          e.appliedGhost = ghostKey;
        }
        const wasShown = e.shown;
        const show = here && !e.compiling && placeEntry(e, t);
        body.holder.visible = show;
        e.shown = show;
        if (wasShown && warmCheck.has(e)) {
          // one frame was drawn with it visible: did that still compile programs? (debug: pre-warm misses)
          const w = warmCheck.get(e)!;
          if (w.seq !== warmSeq) warm.unchecked++;
          else if (programCount() > w.n) warm.misses++;
          warmCheck.delete(e);
        }
        // v2: a ghost carries no lantern (TownScene hasLantern = lantern && !ghost); the Storyteller always does
        syncLantern(e.lantern, svc.lights, show && night && e.carriesLantern && (!e.dead || e.storyteller), e.lanternAnchor);
        if (!show) continue;
        clipIn.dying = dying;
        clipIn.handUp = !!e.pid && raised.has(e.pid) && !dying;
        clipIn.dead = e.dead;
        clipIn.ghostMode = body.ghostMode;
        clipIn.ghostVoteAvailable = e.ghostVote;
        clipIn.talking = !!e.pid && talking.has(e.pid);
        clipIn.clips = body.clipNames;
        clipIn.emotes = body.emotes;
        body.setClips(wantClips(clipIn, e.want));
        const rim = e.pid ? (talking.get(e.pid) ?? '') : '';
        if (rim !== e.rim) {
          body.setRim(rim || null);
          e.rim = rim;
        }
        const f = e.pid ? fades.get(e.pid) : undefined;
        if (f !== undefined) {
          const start = Number.isNaN(f) ? t : f;
          if (Number.isNaN(f)) fades.set(e.pid!, t);
          const a = (t - start) / FADE_S;
          body.setFade(a);
          if (a >= 1) fades.delete(e.pid!);
        }
        body.update(t, dt, ctx);
      }
      if (drawSelf && !state.myPid) doneSelf();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const e of entries.values()) {
        e.removed = true;
        dropBody(e);
      }
      entries.clear();
      warmCheck.clear();
      releaseBillboardSheets(engine as object);
      void spriteMod?.then((m) => m?.releaseSheets(engine as object));
      warmRT?.dispose();
      warmRT = null;
      doneSelf();
    },

    debug() {
      return {
        avatar: (pid?: unknown) => (typeof pid === 'string' ? registry.debug(pid) : null),
        npcs: () =>
          [...entries.values()]
            .filter((e) => e.npc && e.shown)
            .map((e) => ({ id: e.npc!.id, x: e.npc!.x, y: e.npc!.y, home: { ...e.npc!.home }, avoiding: e.npc!.avoiding })),
        avatars3d: () =>
          [...entries.values()].map((e) => ({
            key: e.key,
            cast: e.castId,
            texture: e.body?.texture ?? null,
            kind: e.body?.kind ?? null,
            ghostMode: e.body?.ghostMode ?? null,
            standin: !!e.tint,
            shown: e.shown,
            dead: e.dead,
            ghost: e.appliedGhost,
            building: e.building,
            compiling: e.compiling,
            failed: e.failed,
            parked: e.parked,
            frame: e.body?.frame() ?? null,
            lantern: !!e.lantern.lease,
            look: e.body?.lookInfo?.() ?? null,
          })),
        /** shader pre-warm: builds pre-compiled, resolved / timed out, first frames that still compiled (misses; unchecked = another pre-warm ran in between), total ms */
        avatarsWarm: () => ({ ...warm, ms: Math.round(warm.ms) }),
        /** v3.3 sprites: live sprite bodies, re-bakes, fallbacks, the bake store (cache hits, kits) and the sheets */
        sprites: async () => (S ? { enabled: sprites, ...S.spriteDebug, store: S.storeStats(engine as object), sheets: await S.sheetStats(engine as object) } : { enabled: sprites, loaded: false }),
        /**
         * v3.4 (sync): the rig -> sprite upgrades and a GPU memory estimate of the avatars. `ready` = every player /
         * townsfolk body that can be a sprite is one; rigMiB = geometry of the rig bodies shown now; store = sheets +
         * kits + proxies (bake.ts gpuStats).
         */
        spritesNow: () => {
          let rigs = 0;
          let spr = 0;
          let open = 0;
          let rigBytes = 0;
          for (const e of entries.values()) {
            if (!e.body) continue;
            if (e.body.texture.startsWith('v3-sprite:')) spr++;
            else if (e.body.kind === 'rig') {
              rigs++;
              rigBytes += geometryBytesOf(e.body.holder);
            }
            if (e.upgrade !== 3) open++;
          }
          return { enabled: sprites, gate: sprites ? gateOpen() : false, ...ups, open, rigs, sprites: spr, ready: sprites && open === 0, rigMiB: +(rigBytes / 1048576).toFixed(2), store: S ? S.gpuStats(engine as object) : null, peek: S ? { ...S.peekStats } : null, camKey: (() => { try { if (!S) return null; const c = S.sheetCameraOf(engine); return `${c.texel.toFixed(6)}|${c.pitch.toFixed(4)}|${c.yaw.toFixed(4)}`; } catch { return null; } })() };
        },
      };
    },

    registry: null as unknown as AvatarRegistry3d, // set below

    playEmote(pid, name) {
      const e = entries.get(pid);
      if (!e?.body || !e.shown) return false;
      const clip = resolveEmote({ emotes: e.body.emotes, emoteClips: e.body.emoteClips }, name);
      if (clip === 'idle') return false;
      return e.body.playOnce(clip, lastT);
    },

    fadeIn(pid) {
      fades.set(pid, NaN);
    },

    setTalking(pid, on, rim) {
      if (on) talking.set(pid, rim === undefined ? RIM_DEFAULT : (rim ?? ''));
      else talking.delete(pid);
    },

    selfReady(timeoutMs) {
      if (timeoutMs === undefined) return selfP;
      return Promise.race([selfP, new Promise<void>((r) => setTimeout(r, Math.max(0, timeoutMs)))]);
    },

    settled() {
      for (const e of entries.values()) if (!e.npc && !e.body && !e.failed) return false;
      return true;
    },
  };

  const registry: AvatarRegistry3d = {
    /** Drawn in the viewer's location this frame (has a body and is shown), regardless of the camera (WP4). */
    isShown(pid) {
      const e = entries.get(pid);
      return !!e && !e.npc && !!e.body && e.shown;
    },
    /** The returned object is reused per avatar (copy what you keep across frames). */
    anchorOf(pid) {
      const e = entries.get(pid);
      if (!e || e.npc || !e.body || !e.shown || !view) return null;
      const h = e.body.heightM + e.body.hoverM + e.body.crownM;
      const head = view.worldToScreen(e.pose, e.pose.location, h + HEAD_PAD_M);
      if (!head) return null;
      const a = e.anchor;
      a.feet.x = a.displayFeet.x = e.pose.x;
      a.feet.y = a.displayFeet.y = e.pose.y;
      a.headTopCss.x = head.x;
      a.headTopCss.y = head.y;
      a.heightM = h;
      return a;
    },

    pidAt(cssX, cssY) {
      let best: string | null = null;
      let bestY = -Infinity;
      for (const e of entries.values()) {
        if (e.npc || !e.pid || !e.shown || !e.body) continue;
        const b = screenBox(e);
        if (!b) continue;
        if (cssX >= b.x && cssX <= b.x + b.w && cssY >= b.y && cssY <= b.y + b.h && e.pose.y > bestY) {
          best = e.pid;
          bestY = e.pose.y; // nearer the camera (south) wins at yaw 0
        }
      }
      return best;
    },

    debug(pid: string): AvatarDebug | null {
      const e = entries.get(pid);
      if (!e?.body) return null;
      const b = e.shown ? screenBox(e) : null;
      return {
        texture: e.body.texture,
        frame: e.body.frame(),
        width: e.body.widthM * 16,
        height: (e.body.heightM + e.body.hoverM + e.body.crownM) * 16,
        x: e.pose.x,
        y: e.pose.y,
        screen: b ?? { x: 0, y: 0, w: 0, h: 0 },
      };
    },
  };
  (layer as { registry: AvatarRegistry3d }).registry = registry;

  /** CSS box of an avatar (feet at the bottom centre, head top at the top). */
  const screenBox = (e: Entry): { x: number; y: number; w: number; h: number } | null => {
    if (!view || !e.body) return null;
    const feet = view.worldToScreen(e.pose, e.pose.location, e.body.hoverM);
    const head = view.worldToScreen(e.pose, e.pose.location, e.body.heightM + e.body.hoverM + e.body.crownM);
    if (!feet || !head) return null;
    const w = Math.max(4, e.body.widthM * 16 * view.cssPerPx());
    return { x: feet.x - w / 2, y: head.y, w, h: Math.max(4, feet.y - head.y) };
  };

  return layer;
}
