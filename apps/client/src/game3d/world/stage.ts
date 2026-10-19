// v3 WP3 (v3-stage). The town stage: Hollowmere, its time of day, doors, boarded cottages, interiors,
// the dais and the light pool (docs/v3/INTEGRATION.md §3, §3.1, §3.2). Composition root of world/**.
//
//   const stage = await createStage(host, { layout, tier, initial })     §3.1 construction order, steps 1-3:
//       vendor/town.ts buildHollowmere (grass area, strict 'all', life params, the tier's light budget)
//       -> host.installRuntimeOpts() -> boarded-light gate + door boards + carried-light reserve
//       -> vendor/time.ts createTownTime (tops the pool up BEFORE the warm-up)
//   ... the caller builds the avatars (step 4) ...
//   await stage.warmUp(host.renderNow)    step 5-6: two frames + the whole town + one room, then 'ready'
//   layers.push(stage.layer)              per frame: hour, dais, doors, boards, interiors (Layer3d)
//
// The light pool is constant: the tier budget (12 high / 8 low) = the town pool (time facade) + a small
// reserve that `borrowLight(anchorFn)` lends to carried lanterns (world/lights.ts). The tower bell rings
// only at game phase changes; nothing moves a door but a player going through it.
// Visibility: the vendor's live cut-away follows the own player (vendor/town.ts createCutDriver: player box,
// door cottage, voting circle), and every outdoor avatar (own + remotes) opens a dithered hole in the tree
// crowns / soft dressing in front of it (world/canopy.ts, lead decision D1); both are uniforms only.
// User requests (§9.1, vendor pass B): the tower's dials show the Storyteller's stage timer (world/towerClock.ts
// dialFace -> vendor/town.ts createTowerFace), time-of-day hands otherwise; the voting-circle camera frame
// (`voteCamera()`, world/voteFrame.ts: the vendor's computed votecam fit); the enterable clock tower's room
// (bld:clocktower, vendor/interiors.ts buildTowerInterior) shown like a cottage; the tower door swings too.
import * as THREE from 'three';
import type { LocationId, TownLayout } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import { PX_PER_M } from '../coords';
import type { Layer3d, Scene3dState, Tier } from '../contract';
import type { EngineHost } from '../vendor/engineHost';
import { buildDoorBoards, buildHollowmere, canopyMaterials, createCutDriver, createTowerFace, daisApi, mergeTownKit, releaseTown, removeDaisCandles, doorAngles, gateHouseLights, groundHeight, houseApis, houseLightAnchors, houseProxies, lifePiece, lifeStats, poolLights, seatStones, towerDials, towerDoorApi, townBakeInfo, voteCameraPreset, voteCircle, warmViews, warmWholeTown, type BuiltTown, type HouseApi, type HouseBox, type TownKitMerge, type VendorCameraShot } from '../vendor/town';
import { buildTowerInterior, type TowerRoomFacade } from '../vendor/interiors';
import { createTownTime, presetForHour, type TownTime } from '../vendor/time';
import { createDaisDriver, daisDebug, daisPlan, showcasePlan, type DaisApi, type DaisPlan } from './dais';
import { boardedHouses, createBoardDriver, createDoorDriver, doorTiles } from './doors';
import { createHourClock, darkness, HOURS, stageHour, type HourInput, type StagePhase } from './hour';
import { createInteriorManager, TOWER_KEY, type InteriorManager } from './interiors';
import { createLightReserve, dimNearAnchors, LIGHT_BUDGET, RESERVE, type BorrowedLight, type BorrowOptions, type LightAnchorFn } from './lights';
import { createTownPark } from './park';
import { createCanopyFade, createCanopyUniforms, patchCanopyMaterial, type CanopyPoint } from './canopy';
import { createShadowCadence, shadowEveryFor } from './shadowCadence';
import { dialFace, dialFaceKey, DIAL_STEPS, timerTick, towerTimer, type DialFace } from './towerClock';
import { keepKey } from './hudKeep';
import { chooseVoteFrame, keepOuts, voteFrameKey, type Box, type VoteFrame } from './voteFrame';
import { prewarmSettled } from '../shaderCache';
import { parallelEarly, parallelWarm, parallelWarmEnabled, type ParallelWarmResult, type WarmPipeline, type WarmRenderer } from './shaderWarm';

export interface StageOptions {
  layout: TownLayout;
  tier: Tier;
  /** The game state at mount: the town is built at (and starts from) its stage hour (default 10:00). */
  initial?: { phase: StagePhase; game: Scene3dState['game'] };
  /**
   * The stage frames the interior dollhouse camera while a room is shown (default true). The outdoor camera
   * is input/'s (WP1); turn this off once input/camera reads `interiorCamera()` itself.
   */
  driveInteriorCamera?: boolean;
  /** A room failed to build (the town stays drawn). */
  onError?(e: unknown): void;
}

export interface Stage {
  town: BuiltTown;
  heightAt(x: number, z: number): number;
  /** Per-frame layer (register it with the other Layer3d's). */
  layer: Layer3d;
  /** Lend a reserve PointLight to a carried lantern (null when none is free). Anchor in metres. */
  borrowLight(anchor: LightAnchorFn, opts?: BorrowOptions): BorrowedLight | null;
  /** Shader warm-up behind the loading state (§3.1 order step 5) and the facade's 'ready'. */
  warmUp(renderNow: (t: number) => void): Promise<void>;
  /** The shown game hour (0..24), for Scene3dState.hour. */
  hour(): number;
  /** The location being drawn ('outdoors' until a wanted room is built). */
  drawnLocation(): LocationId;
  /**
   * The built room's dollhouse framing for `loc` (ground focus X/Y/Z m + viewHeight), null while that room is
   * not the one drawn (input/camera's `RigScene.interiorCamera`).
   */
  interiorCamera(loc: LocationId): { X: number; Y: number; Z: number; viewHeight: number } | null;
  /**
   * The room for `loc` is still being built (input/camera holds its pose meanwhile). False once it is drawn, and
   * false when its build failed: the camera then falls back to its own interior framing instead of freezing.
   */
  interiorPending(loc: LocationId): boolean;
  /** Pick proxies of the drawn cottages (input/pick's `HouseProxy` shape; vendor houseBox). */
  houseProxies(): HouseBox[];
  /**
   * The voting-circle frame (user request 1, world/voteFrame.ts: every seat stone + the facing tower dial, the
   * vendor's computed votecam fit at staging A) for a canvas of lowW x lowH texels at `pixelScale`; recomputed only
   * when those change. input/camera's `RigScene.voteCamera` during nominations / votes on the square. `keep` (v3.1):
   * the HUD actually over the canvas (world/hudKeep.ts, low-res px); omitted = voteFrame.ts keepOuts() corner sizes.
   */
  voteCamera(lowW: number, lowH: number, pixelScale: number, keep?: readonly Box[] | null): VendorCameraShot | null;
  /** Floor height (m) at any world point: the town ground, a cottage's flat floor, the clock tower room's stair / landing. */
  floorAt(x: number, z: number): number;
  /** Debug members merged into __ctCamera (also `layer.debug`). */
  debug(): Record<string, () => unknown>;
  destroy(): void;
}

/** Prefetch a room when the own player is within this many px of its door (3 tiles). */
const PREFETCH_PX = 48;
/** The own player "stands at" a cottage door (cut-away keep box) within this many px of its door tile centre. */
const NEAR_DOOR_PX = 24;

export async function createStage(host: EngineHost, o: StageOptions): Promise<Stage> {
  const engine = host.engine;
  const layout = o.layout;
  const tier = o.tier;
  const g0 = o.initial?.game ?? null;
  const hour0 = o.initial ? stageHour({ phase: o.initial.phase, clock: g0?.clock ?? null, nominationsOpen: !!g0?.day?.nominationsOpen, serverNow: serverNow(), sincePhaseMs: 0 }) : HOURS.waiting;
  const reserveN = RESERVE[tier];
  const poolN = LIGHT_BUDGET[tier] - reserveN;

  // ---- 1. the town (strict) + 2. runtime opts
  const town = await buildHollowmere(engine, { quality: tier, tod: presetForHour(hour0), lights: poolN });
  host.installRuntimeOpts();
  const heightAt = groundHeight(town);
  const houses = houseApis(town);
  const houseIds = [...houses.keys()];
  // door art the game swings: the 15 cottages + the enterable clock tower (vendor pass B)
  const doorApis = new Map<string, HouseApi>(houses);
  const towerDoor = towerDoorApi(town);
  if (towerDoor && layout.buildings.some((b) => b.id === 'clocktower')) doorApis.set('clocktower', towerDoor);
  const vdais = daisApi(town);
  // (WP8, user 2026-10-18) no per-player candle stakes in the voting circle (the seals / marks / hands stay)
  const candlesRemoved = removeDaisCandles(town);
  const proxies = houseProxies(town);

  // ---- boards, gates, the carried-light reserve: all BEFORE the warm-up (programs + light count fixed)
  const gate = gateHouseLights(town, houseIds);
  const boards = buildDoorBoards(engine, town);
  const reserve = createLightReserve(engine.scene, reserveN);

  // ---- 3. the time facade (adopts / tops up the town pool to poolN, applies the first hour)
  const playerPos = new THREE.Vector3();
  let havePos = false;
  let isReady = false;
  const park = createTownPark(engine.scene, town.root as THREE.Object3D, lifePiece(town));
  let interiors: InteriorManager | null = null;
  const time: TownTime = createTownTime({
    engine,
    town,
    quality: tier,
    lights: poolN,
    hour: hour0,
    position: () => (havePos ? playerPos : null),
    interior: () => interiors?.shown() ?? null,
  });
  // the clock tower room's `demo` (tower-interior.js): the countdown, the bell, the hours
  const bellFns = new Set<(e?: { t?: number }) => void>();
  let engineT = 0;
  const towerTimerState = { mode: 'idle', frac: 1, stage: 'discussion', doneAt: null as number | null, remaining: 0, duration: 0 };
  const towerFacade: TowerRoomFacade = {
    engine,
    events: {
      on(name, fn) {
        if (name !== 'bell') return () => undefined;
        bellFns.add(fn);
        return () => bellFns.delete(fn);
      },
    },
    passB: { timer: { state: towerTimerState } },
    time: {
      get hours() {
        return clock.hour;
      },
    },
  };
  const hasTower = layout.buildings.some((b) => b.id === 'clocktower');
  interiors = createInteriorManager({
    engine,
    scene: engine.scene,
    park,
    tod: () => time.preset,
    canPark: () => isReady,
    ...(hasTower ? { buildTower: async () => buildTowerInterior(engine, towerFacade) } : {}),
    onError: (e) => {
      console.warn('[town3d] interior failed to build:', e);
      o.onError?.(e);
    },
  });
  const rooms = interiors;
  const offs: (() => void)[] = [];
  // boarded cottages keep their lantern pools dark too (createTime's own lit-in-order map does not know them)
  const pool = poolLights(engine, town);
  const lanternsOf = houseLightAnchors(town);
  let boardedAnchors: { x: number; z: number }[] = [];
  // the vendor's live cut-away, aimed at the own player (outdoors only)
  let meOutdoors = false;
  let nearDoor: { id: string } | null = null;
  const cut = createCutDriver(engine, town, {
    get position() {
      return meOutdoors && havePos ? playerPos : null;
    },
    get nearDoor() {
      return meOutdoors ? nearDoor : null;
    },
    get interior() {
      return rooms.shown();
    },
  });
  // canopy fade (D1): patched before the warm-up compiles anything, driven by uniforms only
  // (`ct.debug.v3canopy=0` = off, an A/B switch for perf runs; read once per build)
  let canopyOff = false;
  let shadowOverride: string | null = null;
  let mergeOff = true;
  let mergeCell = 12;
  let mergeMode: 'batch' | 'merge' = 'batch';
  let mergeOrder: number | undefined;
  let mergeCull: 'view' | 'three' = 'view';
  let mergeAB = false;
  let mergeOwnMat = true;
  let mergeColorFix = true;
  try {
    canopyOff = localStorage.getItem('ct.debug.v3canopy') === '0';
    shadowOverride = localStorage.getItem('ct.debug.v3shadowEvery');
    // perf(v3.1 stage) A/B switches of the static kit merge. v3.3: DEFAULT OFF on every tier (docs/perf-v3/laptop.md §4:
    // a GPU loss on integrated GPUs, nothing gained on desktops even with the v3.3 batch fixes); v3merge=1 = on,
    // v3mergeMode=merge (plain merged geometry
    // per cell instead of the default BatchedMesh per material), v3mergeCell = that cell edge (m),
    // v3mergeAB=1 = window.__ctMergeAB (toggle + render the same frame twice, for pixel diffs)
    mergeOff = localStorage.getItem('ct.debug.v3merge') !== '1';
    mergeCell = Number(localStorage.getItem('ct.debug.v3mergeCell')) || 12;
    mergeMode = localStorage.getItem('ct.debug.v3mergeMode') === 'merge' ? 'merge' : 'batch';
    mergeAB = localStorage.getItem('ct.debug.v3mergeAB') === '1';
    // perf(v3.3 gpu): v3batchMat=0 = the batches draw with the SHARED kit materials (the v3.1 program flips; merge.ts ownMaterials)
    mergeOwnMat = localStorage.getItem('ct.debug.v3batchMat') !== '0';
    // v3batchFix=0 = without the three r170 BatchedMesh colorTexture workaround (a program re-resolve per batch draw)
    mergeColorFix = localStorage.getItem('ct.debug.v3batchFix') !== '0';
    const mo = localStorage.getItem('ct.debug.v3mergeOrder'); // A/B: the merged meshes' renderOrder
    mergeCull = localStorage.getItem('ct.debug.v3mergeCull') === 'three' ? 'three' : 'view';
    mergeOrder = mo !== null && Number.isFinite(Number(mo)) ? Number(mo) : undefined;
  } catch {
    canopyOff = false;
  }
  // perf(stage): the sun shadow map every 2nd frame at low (world/shadowCadence.ts; forced on cuts / room switches)
  const shadows = createShadowCadence(shadowEveryFor(tier, shadowOverride));
  const shadowMap = engine.renderer.shadowMap;
  const shadowIn = { ready: false, location: 'outdoors', x: 0, z: 0, viewHeight: 1 };
  const canopyU = createCanopyUniforms();
  let canopyPatched = 0;
  if (!canopyOff) for (const m of canopyMaterials(town)) if (patchCanopyMaterial(m, canopyU)) canopyPatched++;
  const canopy = createCanopyFade(canopyU);
  // a reused point pool (one object per avatar slot, never per frame)
  const canopyPts: CanopyPoint[] = [];
  let canopyN = 0;
  const canopyAt = (key: string, x: number, y: number, priority: number) => {
    let p = canopyPts[canopyN];
    if (!p) {
      p = { key, X: 0, Y: 0, Z: 0, priority };
      canopyPts.push(p);
    }
    const X = x / PX_PER_M;
    const Z = y / PX_PER_M;
    p.key = key;
    p.X = X;
    p.Y = heightAt(X, Z);
    p.Z = Z;
    p.priority = priority;
    canopyN++;
  };
  // the tower's dials: the Storyteller's countdown face (towerClock.ts dialFace), else the time-of-day hands
  const towerFace = createTowerFace(engine, town);
  // perf(v3.1 stage): the static kit meshes of the cottages / tower / props / ground / foliage merged across pieces, one
  // BatchedMesh per kit material + caster flag (vendor/town.ts mergeTownKit, world/merge.ts; ~ -25 % of the frame's
  // draws, docs/perf-v3/stage.md §6), before the warm-up compiles the batching program variants
  let kitMerge: TownKitMerge | null = null;
  if (!mergeOff) {
    try {
      kitMerge = mergeTownKit(engine, town, { cell: mergeCell, mode: mergeMode, renderOrder: mergeOrder, cull: mergeCull, ownMaterials: mergeOwnMat, batchColorFix: mergeColorFix });
      if (kitMerge) host.gpuDebug?.({ merged: kitMerge.merged });
    } catch (e) {
      console.warn('[town3d] kit merge failed (unmerged town):', e);
      kitMerge = null;
    }
  }
  const abHook = mergeAB && kitMerge
    ? {
        set: (on: boolean) => kitMerge?.merged.setEnabled(on),
        render: () => {
          // the same frame again (no updaters); returns its draw calls (all passes, the shadow map included)
          const info = engine.renderer.info;
          info.reset();
          shadowMap.autoUpdate = true;
          engine.pipeline.render();
          return info.render.calls;
        },
        info: () => (kitMerge ? { ...kitMerge.merged.info(), left: kitMerge.left } : null),
        /** The draws of one re-render of this frame, by "parent/mesh name | material" (debug census). */
        drawn: () => {
          const r = engine.renderer as unknown as { renderBufferDirect: (...a: unknown[]) => unknown };
          const orig = r.renderBufferDirect;
          const out = new Map<string, number>();
          r.renderBufferDirect = function (this: unknown, ...a: unknown[]) {
            const obj = a[4] as THREE.Object3D;
            const mat = a[3] as THREE.Material;
            const k = `${obj.parent?.name ?? ''}/${obj.name} | ${mat.name || mat.type}`;
            out.set(k, (out.get(k) ?? 0) + 1);
            return orig.apply(this, a);
          };
          try {
            shadowMap.autoUpdate = true;
            engine.pipeline.render();
          } finally {
            r.renderBufferDirect = orig;
          }
          return [...out].sort((p, q) => q[1] - p[1]);
        },
      }
    : null;
  if (abHook) (window as unknown as { __ctMergeAB?: unknown }).__ctMergeAB = abHook;
  let towerFaceKey = 'tod';
  const faceBuf: DialFace = { mode: 'running', stage: 'discussion', q: 0, flashOn: false, night: false };
  let towerReadout: string | null = null;
  // the readout (debug) only when the clock object or its shown second changes (timerTick)
  let towerClockRef: unknown = undefined;
  let towerTick = NaN;
  offs.push(time.on('tod', (p) => rooms.setTod(String((p as { preset?: string })?.preset ?? time.preset))));
  let bells = 0;
  offs.push(
    time.on('bell', () => {
      bells++;
      for (const fn of bellFns) fn({ t: engineT });
    }),
  );
  // the voting-circle frame (world/voteFrame.ts), cached per canvas size
  const voteSeats = seatStones();
  let voteKey = '';
  let voteShot: VendorCameraShot | null = null;
  let voteLast: VoteFrame | null = null;

  // ---- drivers
  const dais = createDaisDriver(vdais as unknown as DaisApi);
  const doors = createDoorDriver((id, f) => doorApis.get(id)?.setDoor(f), doorTiles(layout));
  const board = createBoardDriver(houseIds, (id, on) => {
    gate.setBoarded(id, on);
    const b = boards.get(id);
    if (b) b.visible = on;
  });
  const clock = createHourClock(hour0);
  let destroyed = false;
  // per-frame vendor work runs inside renderAt, after the pieces' own updaters (as the demo orders it)
  engine.onUpdate((t: number, dt: number) => {
    if (destroyed) return;
    engineT = t;
    time.update(t, dt);
    dimNearAnchors(pool, boardedAnchors);
    rooms.update(t, dt);
    reserve.update(darkness(clock.hour), t);
    cut?.update();
    kitMerge?.update();
    if (shadows.every > 1) {
      const c = engine.camera;
      shadowIn.ready = isReady;
      shadowIn.location = rooms.drawn();
      shadowIn.x = c.target.x;
      shadowIn.z = c.target.z;
      shadowIn.viewHeight = c.viewHeight;
      shadowMap.autoUpdate = shadows.step(shadowIn);
    }
  });

  // ---- per frame (Layer3d, before renderAt)
  let lastPhase: StagePhase | null = null;
  let phaseSince = performance.now();
  let lastGame: Scene3dState['game'] | undefined = undefined;
  let lastPlan: DaisPlan | null = null;
  let prefetchAt = 0;
  let targetHour = hour0;
  const driveCam = o.driveInteriorCamera !== false;
  // reused per-frame inputs (no object literal per frame)
  const hourIn: HourInput = { phase: 'waiting', clock: null, nominationsOpen: false, serverNow: 0, sincePhaseMs: 0 };
  const camSet = { target: new THREE.Vector3(), yaw: 0, pitch: Math.PI / 6, viewHeight: 1 };
  // the cottages (+ the tower) and their door centres (px), once: no regex over the buildings per frame
  const HOUSE_ID = /^house-\d+$/;
  const doorPts = layout.buildings
    .filter((b) => b.id === 'clocktower' || HOUSE_ID.test(b.id))
    .map((b) => ({ id: b.id, house: HOUSE_ID.test(b.id), key: b.id === 'clocktower' ? TOWER_KEY : Number(b.id.slice(6)), x: (b.door.x + 0.5) * layout.tileSize, y: (b.door.y + 0.5) * layout.tileSize, near: { id: b.id } }));
  const houseIndexOfSeat = (seat: number): number | null => {
    const b = layout.buildings.find((x) => x.houseIndex === seat && HOUSE_ID.test(x.id));
    return b ? Number(b.id.slice(6)) : null;
  };
  const prefetch = (state: Scene3dState, now: number) => {
    if (now < prefetchAt) return;
    prefetchAt = now + 250;
    const g = state.game;
    if (g?.kind === 'player') {
      const home = houseIndexOfSeat(g.you.seat);
      if (home !== null) rooms.prefetch(home);
    }
    const me = state.me;
    if (!me || me.location !== 'outdoors') return;
    let bestKey: number | null = null; // (TOWER_KEY is -1)
    let bestD = PREFETCH_PX;
    for (const b of doorPts) {
      const d = Math.hypot(b.x - me.x, b.y - me.y);
      if (d < bestD) {
        bestD = d;
        bestKey = b.key;
      }
    }
    if (bestKey !== null) rooms.prefetch(bestKey);
  };

  const layer: Layer3d = {
    update(state, t) {
      if (destroyed) return;
      const now = performance.now();
      // phase changes: the bell (never on the first look at the game), the dawn ease start
      if (state.phase !== lastPhase) {
        if (lastPhase !== null) time.ringBell();
        lastPhase = state.phase;
        phaseSince = now;
      }
      // hour (§3.1)
      const g = state.game;
      const sNow = serverNow();
      const clk = g?.clock ?? null;
      hourIn.phase = state.phase;
      hourIn.clock = clk;
      hourIn.nominationsOpen = !!g?.day?.nominationsOpen;
      hourIn.serverNow = sNow;
      hourIn.sincePhaseMs = now - phaseSince;
      targetHour = stageHour(hourIn);
      time.setHour(clock.step(targetHour, now, state.reducedMotion));
      // dais + boards follow the game view (a new object on every server update)
      if (g !== lastGame || !lastPlan) {
        lastGame = g;
        lastPlan = daisPlan(g, state.phase);
        dais.apply(lastPlan);
        board.apply(boardedHouses(layout, g));
        boardedAnchors = [...board.boarded].flatMap((id) => (lanternsOf.get(id) ?? []).map((p) => ({ x: p.x, z: p.z })));
      }
      // the tower: the Storyteller's stage timer on the four dials (else the time-of-day hands)
      const tick = timerTick(clk, sNow);
      if (clk !== towerClockRef || tick !== towerTick) {
        towerClockRef = clk;
        towerTick = tick;
        const plan = towerTimer(clk, sNow);
        towerReadout = plan?.readout ?? null;
        towerTimerState.remaining = plan ? plan.remainingMs / 1000 : 0;
        towerTimerState.duration = plan ? plan.totalMs / 1000 : 0;
      }
      const face = dialFace(clk, sNow, clock.hour, faceBuf);
      const fk = dialFaceKey(face);
      if (fk !== towerFaceKey) {
        towerFaceKey = fk;
        towerFace?.show(face, fk);
        const wasDone = towerTimerState.mode === 'done';
        towerTimerState.mode = face?.mode ?? 'idle';
        towerTimerState.frac = face ? face.q / DIAL_STEPS : 1;
        towerTimerState.stage = face?.stage ?? 'discussion';
        if (face?.mode === 'done' && !wasDone) towerTimerState.doneAt = engineT - Math.max(0, sNow - (clk?.endsAt ?? sNow)) / 1000;
        else if (face?.mode !== 'done') towerTimerState.doneAt = null;
      }
      // doors: anybody going in / out through a cottage door
      doors.observe(state, t);
      doors.tick(t);
      // the own player's place: town or a room (+ light-pool aim position outdoors)
      const me = state.me;
      meOutdoors = !!me && me.location === 'outdoors';
      nearDoor = null;
      if (me && me.location === 'outdoors') {
        const X = me.x / PX_PER_M;
        const Z = me.y / PX_PER_M;
        playerPos.set(X, heightAt(X, Z), Z);
        havePos = true;
        let bd = NEAR_DOOR_PX;
        for (const b of doorPts) {
          if (!b.house) continue;
          const d = Math.hypot(b.x - me.x, b.y - me.y);
          if (d < bd) {
            bd = d;
            nearDoor = b.near;
          }
        }
      }
      rooms.show(me?.location ?? 'outdoors');
      // canopy holes for every avatar drawn outdoors (own first); none while a room is drawn
      canopyN = 0;
      if (!rooms.shown()) {
        if (me && me.location === 'outdoors') canopyAt(me.pid, me.x, me.y, 0);
        for (const [pid, p] of state.remotes) if (p.location === 'outdoors') canopyAt(pid, p.x, p.y, 1);
      }
      canopy.update(canopyPts, engine.camera, now, canopyN);
      prefetch(state, now);
      const cam = rooms.camera();
      if (driveCam && cam) {
        camSet.target.copy(cam.target);
        camSet.viewHeight = cam.viewHeight;
        engine.camera.set(camSet);
      }
    },
    destroy() {
      stage.destroy();
    },
    debug: () => stage.debug(),
  };

  let warm: { town: [number, number]; room: number | null; programs: number; parallel: ParallelWarmResult | null } | null = null;
  // (v3.5 shaders) parallel program issue (world/shaderWarm.ts): started once, awaited by warmUp
  let parallelP: Promise<ParallelWarmResult | null> | null = null;
  const startParallel = (): Promise<ParallelWarmResult | null> =>
    (parallelP ??= !parallelWarmEnabled()
      ? Promise.resolve(null)
      : (async () => {
          await prewarmSettled(); // a running shader prewarm first (shaderCache.ts): then these are cache hits
          if (destroyed) return null;
          engine.camera.update();
          return parallelWarm(engine.renderer as unknown as WarmRenderer, engine.pipeline as unknown as WarmPipeline, engine.scene, engine.camera.cam, { live: () => !destroyed }).then((r) => {
            (window as unknown as { __ctShaders?: unknown }).__ctShaders = r;
            try {
              performance.mark('ct3d:par-ready');
            } catch {
              /* no user timing */
            }
            return r;
          });
        })());
  const stage: Stage = {
    town,
    heightAt,
    layer,
    borrowLight: (anchor, opts) => reserve.borrow(anchor, opts),
    async warmUp(renderNow) {
      // the tower's countdown face once (kit solid + glass: the town's programs; this proves it), then the hands again
      towerFace?.show({ mode: 'running', stage: 'nominations', q: DIAL_STEPS / 2, flashOn: false, night: false }, 'warm');
      // (v3.5) the first view's programs were issued at once (startParallel, at the end of createStage): the driver
      // links them in parallel / off the main thread; wait for them here so the frames below do not block on links
      const parallel = await startParallel();
      if (destroyed) return;
      // two real frames (every updater runs: the facade's first look, the dais, the pool aim) ...
      renderNow(0);
      renderNow(1 / 60);
      // ... every dais state (vote lamps, the hand, embers, dead / ghost / block stones; then night) ...
      for (const [k, ph] of (['vote', 'execution', 'night'] as const).entries()) {
        dais.apply(showcasePlan(ph));
        renderNow((2 + k) / 60);
      }
      dais.invalidate();
      lastPlan = null; // the first real frame writes the real seats again
      towerFace?.show(null, 'tod');
      towerFaceKey = 'tod'; // the first real frame shows the real timer (if one runs)
      // ... the whole town, and one room (the interior kit's materials), behind the loading state
      const townP = warmWholeTown(engine);
      let roomP: number | null = null;
      const it = await rooms.load(0);
      if (it && !destroyed && !rooms.shown()) {
        engine.scene.add(it.group);
        it.group.updateMatrixWorld(true);
        roomP = warmViews(engine, [{ target: it.camera.target, viewHeight: it.camera.viewHeight }])[1];
        it.group.removeFromParent();
      }
      warm = { town: townP, room: roomP, programs: engine.renderer.info.programs?.length ?? 0, parallel };
      isReady = true;
      time.ready();
    },
    hour: () => clock.hour,
    drawnLocation: () => rooms.drawn(),
    interiorCamera: (loc) => {
      const c = rooms.drawn() === loc ? rooms.camera() : null;
      return c ? { X: c.target.x, Y: c.target.y, Z: c.target.z, viewHeight: c.viewHeight } : null;
    },
    interiorPending: (loc) => rooms.drawn() !== loc && rooms.pending(),
    houseProxies: () => proxies,
    voteCamera(lowW, lowH, pixelScale, keep) {
      if (!(lowW > 0 && lowH > 0)) return null;
      const k = `${voteFrameKey(lowW, lowH, pixelScale)}|${keepKey(keep)}`;
      if (k !== voteKey) {
        voteKey = k;
        try {
          const f = chooseVoteFrame({ lowW, lowH, seats: voteSeats, dials: towerDials(town), keep: keep ?? keepOuts(lowW, lowH, pixelScale), ring: voteCircle() });
          voteLast = f;
          voteShot = { X: f.target.x, Y: 0, Z: f.target.z, viewHeight: f.viewHeight, yaw: f.yaw, pitch: f.pitch };
        } catch (e) {
          console.warn('[town3d] vote frame failed', e);
          voteShot = null;
        }
      }
      return voteShot;
    },
    floorAt: (x, z) => {
      if (x < 100) return heightAt(x, z);
      const it = rooms.shown();
      return it?.heightAt ? it.heightAt(x, z) : 0;
    },
    debug: () => ({
      dais: () => daisDebug(dais.shown),
      stage: () => ({
        hour: +clock.hour.toFixed(3),
        targetHour: +targetHour.toFixed(3),
        preset: time.preset,
        bells,
        phase: lastPhase,
        drawn: rooms.drawn(),
        interiors: { cached: rooms.cached(), lastSwitchMs: rooms.lastSwitchMs, parked: park.parked },
        doors: { open: doors.open(), writes: Object.fromEntries(doors.writes), angles: doorAngles(town) },
        boarded: [...board.boarded].sort(),
        life: lifeStats(engine),
        lights: { pool: poolN, poolFound: pool.length, reserve: reserve.size, lent: reserve.lent, boardedAnchors: boardedAnchors.length },
        cut: cut ? cut.info() : null,
        canopy: { patched: canopyPatched, ...canopy.debug() },
        candlesRemoved,
        merge: kitMerge ? kitMerge.merged.info() : null,
        shadows: { every: shadows.every, rendered: shadows.rendered, skipped: shadows.skipped },
        timer: { available: !!towerFace, readout: towerReadout, face: towerFaceKey, ...(towerFace ? { info: towerFace.info() } : {}) },
        vote: voteLast ? { yaw: Math.round((voteLast.yaw * 180) / Math.PI), pitch: Math.round((voteLast.pitch * 180) / Math.PI), viewHeight: +voteLast.viewHeight.toFixed(3), target: [+voteLast.target.x.toFixed(3), +voteLast.target.z.toFixed(3)], key: voteKey } : { preset: voteCameraPreset() },
        warm,
        time: time.info(),
        // (v3.3 bake) tree-cache numbers of this build (null when ct.debug.v3bake=0) + the vendor town build ms
        bake: townBakeInfo(),
        townBuildMs: Number((engine.stats as Record<string, unknown> | undefined)?.townBuildMs) || null,
      }),
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs.splice(0)) off();
      rooms.dispose();
      shadowMap.autoUpdate = true;
      towerFace?.dispose();
      kitMerge?.merged.dispose();
      if (abHook) {
        const w = window as unknown as { __ctMergeAB?: unknown };
        if (w.__ctMergeAB === abHook) delete w.__ctMergeAB;
      }
      // the piece registry: a closure the vendor keeps (V8 allocation-site feedback of a piece api literal) must not
      // reach every piece of this town after the unmount (C1 leak check)
      releaseTown(town);
      bellFns.clear();
      reserve.dispose();
      time.dispose();
      gate.restore();
    },
  };
  // (v3.5) issue the town's programs now: they compile while the caller builds the avatars (warmUp awaits them)
  if (parallelEarly()) void startParallel();
  return stage;
}
