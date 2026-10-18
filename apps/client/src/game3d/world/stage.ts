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
import * as THREE from 'three';
import type { LocationId, TownLayout } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import { PX_PER_M } from '../coords';
import type { Layer3d, Scene3dState, Tier } from '../contract';
import type { EngineHost } from '../vendor/engineHost';
import { buildDoorBoards, buildHollowmere, daisApi, doorAngles, gateHouseLights, groundHeight, houseApis, houseProxies, lifePiece, lifeStats, warmViews, warmWholeTown, type BuiltTown, type HouseBox } from '../vendor/town';
import { createTownTime, presetForHour, type TownTime } from '../vendor/time';
import { createDaisDriver, daisDebug, daisPlan, showcasePlan, type DaisApi, type DaisPlan } from './dais';
import { boardedHouses, createBoardDriver, createDoorDriver } from './doors';
import { createHourClock, darkness, HOURS, stageHour, type StagePhase } from './hour';
import { createInteriorManager, type InteriorManager } from './interiors';
import { createLightReserve, LIGHT_BUDGET, RESERVE, type BorrowedLight, type BorrowOptions, type LightAnchorFn } from './lights';
import { createTownPark } from './park';

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
  /** Pick proxies of the drawn cottages (input/pick's `HouseProxy` shape; vendor houseBox). */
  houseProxies(): HouseBox[];
  /** Debug members merged into __ctCamera (also `layer.debug`). */
  debug(): Record<string, () => unknown>;
  destroy(): void;
}

/** Prefetch a room when the own player is within this many px of its door (3 tiles). */
const PREFETCH_PX = 48;

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
  const vdais = daisApi(town);
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
  interiors = createInteriorManager({
    engine,
    scene: engine.scene,
    park,
    tod: () => time.preset,
    canPark: () => isReady,
    onError: (e) => {
      console.warn('[town3d] interior failed to build:', e);
      o.onError?.(e);
    },
  });
  const rooms = interiors;
  const offs: (() => void)[] = [];
  offs.push(time.on('tod', (p) => rooms.setTod(String((p as { preset?: string })?.preset ?? time.preset))));
  let bells = 0;
  offs.push(time.on('bell', () => bells++));

  // ---- drivers
  const dais = createDaisDriver(vdais as unknown as DaisApi);
  const doors = createDoorDriver((id, f) => houses.get(id)?.setDoor(f));
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
    time.update(t, dt);
    rooms.update(t, dt);
    reserve.update(darkness(clock.hour), t);
  });

  // ---- per frame (Layer3d, before renderAt)
  let lastPhase: StagePhase | null = null;
  let phaseSince = performance.now();
  let lastGame: Scene3dState['game'] | undefined = undefined;
  let lastPlan: DaisPlan | null = null;
  let prefetchAt = 0;
  let targetHour = hour0;
  const driveCam = o.driveInteriorCamera !== false;
  const houseIndexOfSeat = (seat: number): number | null => {
    const b = layout.buildings.find((x) => x.houseIndex === seat && /^house-\d+$/.test(x.id));
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
    let best: { i: number; d: number } | null = null;
    for (const b of layout.buildings) {
      if (!/^house-\d+$/.test(b.id)) continue;
      const d = Math.hypot((b.door.x + 0.5) * layout.tileSize - me.x, (b.door.y + 0.5) * layout.tileSize - me.y);
      if (d < PREFETCH_PX && (!best || d < best.d)) best = { i: Number(b.id.slice(6)), d };
    }
    if (best) rooms.prefetch(best.i);
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
      targetHour = stageHour({ phase: state.phase, clock: g?.clock ?? null, nominationsOpen: !!g?.day?.nominationsOpen, serverNow: serverNow(), sincePhaseMs: now - phaseSince });
      time.setHour(clock.step(targetHour, now, state.reducedMotion));
      // dais + boards follow the game view (a new object on every server update)
      if (g !== lastGame || !lastPlan) {
        lastGame = g;
        lastPlan = daisPlan(g, state.phase);
        dais.apply(lastPlan);
        board.apply(boardedHouses(layout, g));
      }
      // doors: anybody going in / out through a cottage door
      doors.observe(state, t);
      doors.tick(t);
      // the own player's place: town or a room (+ light-pool aim position outdoors)
      const me = state.me;
      if (me && me.location === 'outdoors') {
        const X = me.x / PX_PER_M;
        const Z = me.y / PX_PER_M;
        playerPos.set(X, heightAt(X, Z), Z);
        havePos = true;
      }
      rooms.show(me?.location ?? 'outdoors');
      prefetch(state, now);
      const cam = rooms.camera();
      if (driveCam && cam) engine.camera.set({ target: cam.target, yaw: 0, pitch: Math.PI / 6, viewHeight: cam.viewHeight });
    },
    destroy() {
      stage.destroy();
    },
    debug: () => stage.debug(),
  };

  let warm: { town: [number, number]; room: number | null; programs: number } | null = null;
  const stage: Stage = {
    town,
    heightAt,
    layer,
    borrowLight: (anchor, opts) => reserve.borrow(anchor, opts),
    async warmUp(renderNow) {
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
      warm = { town: townP, room: roomP, programs: engine.renderer.info.programs?.length ?? 0 };
      isReady = true;
      time.ready();
    },
    hour: () => clock.hour,
    drawnLocation: () => rooms.drawn(),
    interiorCamera: (loc) => {
      const c = rooms.drawn() === loc ? rooms.camera() : null;
      return c ? { X: c.target.x, Y: c.target.y, Z: c.target.z, viewHeight: c.viewHeight } : null;
    },
    houseProxies: () => proxies,
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
        lights: { pool: poolN, reserve: reserve.size, lent: reserve.lent },
        warm,
        time: time.info(),
      }),
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs.splice(0)) off();
      rooms.dispose();
      reserve.dispose();
      time.dispose();
      gate.restore();
    },
  };
  return stage;
}
