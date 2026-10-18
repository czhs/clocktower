// Gameplay core: the renderer-free half of the gameplay layer (v3 WP0s, split out of gameplay/index.ts with
// no behaviour change; docs/v3/INTEGRATION.md §3, §8 WP0s). Used by the Phaser town through
// gameplay/phaserView.ts and directly by the v3 3D town (game3d/).
//
//   * drive()          server-driven local avatar (WorldSnapshot.you: 'auto' escort / 'frozen'), plus a
//                      hold-still while the Storyteller is picking a map point (pick.ts).
//   * doorOverride     Storyteller door locks / forced opens from WorldSnapshot.doors.
//   * door tags        publishDoorTags on every snapshot (doorTagsStore, drawn by the renderer).
//   * gameplayState    the HUD store, written by frame() whenever a field changes.
//   * frame()          everything a renderer draws this frame, in v2 world px: seat markers, vote clock
//                      targets, raised hands of visible voters, bedtime / gathering hints, the pick label.
//   * pick input       pickAt(x, y) for a primary press at a world point; Escape cancels (window listener).
//
// Secrecy: everything is derived from the viewer's own game view / snapshot (public data plus the viewer's
// own seat). Other avatars come from remoteEntities, which the renderer fills only with entities the server
// let us see; we additionally require the same location as ours. Nothing outdoors-related at night.
//
// Must not import 'phaser' or three (apps/client/test/gameplay.core.test.ts checks the import closure).
import {
  CIRCLE_SEATED_PX,
  circleCentre,
  circleSpots,
  homeBuilding,
  tileCenterPx,
  type CircleSpot,
  type Facing,
  type GamePhase,
  type LocationId,
  type NominationView,
  type PlayerGameView,
  type StorytellerGameView,
  type WorldSnapshot,
} from '@ct/protocol';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
import { remoteEntities } from '../../net/localPlayer';
import type { RoomConnection } from '../../net/room';
import { doorTagsStore, publishDoorTags } from './doorTags';
import { SelfDriver } from './drive';
import { stagePick, type StagePick } from './pick';
import { gameplayState, INITIAL_GAMEPLAY_STATE, type GameplayState } from './state';

export type GameView = PlayerGameView | StorytellerGameView;

/** The slice of RoomConnection the core reads (a real RoomConnection satisfies it). */
export type GameplayConn = Pick<RoomConnection, 'events' | 'lobbyView' | 'gameView'>;

export interface GameplayCoreCtx {
  conn: GameplayConn;
  myPid(): string | null;
  /** The renderer's local predicted avatar state (feet px). */
  me(): { x: number; y: number; location: LocationId; facing: Facing };
  amStoryteller(): boolean;
}

export interface DrivenPose {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

export interface SeatMarker {
  seat: number;
  x: number;
  y: number;
  /** The viewer's own spot (pulses gold). */
  mine: boolean;
  /** Publicly dead (pale wisp). */
  dead: boolean;
}

export interface VoterHand {
  seat: number;
  pid: string;
  /** Feet px of the voter (yourself or a visible remote in your location). */
  x: number;
  y: number;
  /** Locked yes (solid) vs raised, not yet counted (outline). */
  locked: boolean;
}

export type GameplayHint =
  /** Bedtime: marker on your home door; `arrow` = also an arrow from you toward it (> 20 px away). */
  | { kind: 'home'; door: { x: number; y: number }; arrow: boolean }
  /** Gathering, not seated: arrow from you toward your spot. */
  | { kind: 'seat'; spot: { x: number; y: number } };

/**
 * Everything a renderer draws for the gameplay layer this frame (v2 world px).
 *
 * The core reuses ONE frame object (and its arrays / entries) across calls: a frame is valid only until the next
 * frame() call. Read it in the same tick; copy anything you need to keep.
 */
export interface GameplayFrame {
  view: GameView | null;
  me: { x: number; y: number; location: LocationId; facing: Facing };
  /**
   * The Storyteller's active map-point pick, any phase / location: the renderer draws the crosshair + label only.
   * Completing a pick always goes through core.pickAt / core.releasePointer (holds the avatar, clears the pick).
   */
  picking: { readonly label: string } | null;
  /** Raised / locked hands of visible voters (any location; empty at night or without a vote). */
  hands: VoterHand[];
  /** Nomination-circle seat markers (gathered, outdoors, not night), else empty. */
  markers: SeatMarker[];
  /** The vote clock (outdoors, not night, a nomination voting with a current voter), else null. */
  clock: { centre: { x: number; y: number }; voter: CircleSpot | null; nominee: CircleSpot | null } | null;
  /** Personal hint (players only, outdoors, never while the server walks us), else null. */
  hint: GameplayHint | null;
}

export interface GameplayCore {
  /** Once per frame: publishes gameplayState (on change) and returns what to draw. */
  frame(): GameplayFrame;
  /** Non-null => the renderer applies this pose to the local avatar instead of input and sends no 'move'. */
  drive(): DrivenPose | null;
  /** !drive-active and not picking; convenience. */
  wantsLocalInput(): boolean;
  /** Storyteller door override for a building (from snapshot.doors): true locked, false forced open, null = phase default. */
  doorOverride(buildingId: string): boolean | null;
  /** Bumps whenever the door overrides change (the renderer refreshes its door prompt on change). */
  doorOverrideVersion(): number;
  /** A pick is armed and the viewer is the Storyteller. */
  isPicking(): boolean;
  /** Primary press at a world point (feet px). Returns true when it completed a Storyteller pick. */
  pickAt(x: number, y: number): boolean;
  /** Primary release: the avatar may walk again. */
  releasePointer(): void;
  destroy(): void;
}

const NIGHT: ReadonlySet<GamePhase> = new Set(['first_night', 'night']);
const r = Math.round;

export function createGameplayCore(ctx: GameplayCoreCtx): GameplayCore {
  const { conn } = ctx;
  const driver = new SelfDriver();
  let doors: Record<string, boolean> = {};
  let doorsKey = '';
  let doorsVersion = 0;
  const offs: (() => void)[] = [];

  offs.push(
    conn.events.on('world:snapshot', (s: WorldSnapshot) => {
      driver.onSnapshot(s, ctx.myPid());
      // The snapshot carries the full override set; absent = no overrides.
      doors = s.doors ?? {};
      const k = JSON.stringify(doors);
      if (k !== doorsKey) {
        doorsKey = k;
        doorsVersion++;
      }
      publishDoorTags(s.doorTags, conn.lobbyView.get());
    }),
  );

  // Door tags are rendered by the renderer as bulletin boards (from doorTagsStore).
  offs.push(() => doorTagsStore.set({}));

  // ---------------------------------------------------------------------------------------
  // Storyteller pick mode

  let holdPointer = false; // the click that picked is still held: keep the ST from walking toward it
  const isPicking = () => stagePick.get() !== null && ctx.amStoryteller();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && stagePick.get()) {
      e.preventDefault();
      stagePick.set(null);
    }
  };
  window.addEventListener('keydown', onKey);
  offs.push(() => window.removeEventListener('keydown', onKey));

  // ---------------------------------------------------------------------------------------
  // helpers

  let spotsKey = '';
  let spots: CircleSpot[] = [];
  let spotsOf: GameView['players'] | null = null;
  const spotsFor = (view: GameView): CircleSpot[] => {
    if (view.players === spotsOf) return spots; // same view object: no map + sort + join per call
    spotsOf = view.players;
    const seats = view.players.map((p) => p.seat);
    const key = [...seats].sort((a, b) => a - b).join(',');
    if (key !== spotsKey) {
      spotsKey = key;
      spots = circleSpots(currentLayout(), seats);
    }
    return spots;
  };
  const mySeat = (view: GameView | null): number | null => (view?.kind === 'player' ? view.you.seat : null);
  const homeDoorOf = (seat: number) => {
    const b = homeBuilding(currentLayout(), seat);
    return b ? tileCenterPx(currentLayout(), b.door) : null;
  };
  const centre = circleCentre(currentLayout());
  const votingNomination = (view: GameView): NominationView | null => view.day?.nominations.find((n) => n.status === 'voting') ?? null;

  const publish = (next: GameplayState) => {
    const cur = gameplayState.get();
    const same =
      cur.control === next.control &&
      cur.goal === next.goal &&
      cur.seated === next.seated &&
      cur.atHome === next.atHome &&
      cur.ownSpot?.x === next.ownSpot?.x &&
      cur.ownSpot?.y === next.ownSpot?.y &&
      cur.homeDoor?.x === next.homeDoor?.x &&
      cur.homeDoor?.y === next.homeDoor?.y;
    if (!same) gameplayState.set(next);
  };

  // ---------------------------------------------------------------------------------------
  // per frame: one reused frame object, pooled entries (valid until the next frame() call)

  const out: GameplayFrame = { view: null, me: ctx.me(), picking: null, hands: [], markers: [], clock: null, hint: null };
  const handPool: VoterHand[] = [];
  const markerPool: SeatMarker[] = [];
  const clockOut: NonNullable<GameplayFrame['clock']> = { centre, voter: null, nominee: null };
  const hintHome: Extract<GameplayHint, { kind: 'home' }> = { kind: 'home', door: { x: 0, y: 0 }, arrow: false };
  const hintSeat: Extract<GameplayHint, { kind: 'seat' }> = { kind: 'seat', spot: { x: 0, y: 0 } };
  let pickOf: StagePick | null = null;
  let pickOut: { label: string } | null = null;
  const reset = (view: GameView | null, me: GameplayFrame['me']): GameplayFrame => {
    out.view = view;
    out.me = me;
    const pick = isPicking() ? stagePick.get() : null;
    if (pick !== pickOf) {
      pickOf = pick;
      pickOut = pick ? { label: pick.label } : null; // never hand out onPick (renderers go through pickAt)
    }
    out.picking = pickOut;
    out.hands.length = 0;
    out.markers.length = 0;
    out.clock = null;
    out.hint = null;
    return out;
  };

  const frame = (): GameplayFrame => {
    const view = conn.gameView.get();
    const me = ctx.me();
    const myPid = ctx.myPid();
    const st = ctx.amStoryteller();
    const out = reset(view, me);

    // ---- HUD state
    const seat = mySeat(view);
    const ownSpot = view && seat !== null ? (spotsFor(view).find((s) => s.seat === seat) ?? null) : null;
    const homeDoor = seat !== null ? homeDoorOf(seat) : null;
    const outdoors = me.location === 'outdoors';
    const gathering = !!view?.gathering && !NIGHT.has(view.phase);
    const seated = gathering && outdoors && !!ownSpot && Math.hypot(me.x - ownSpot.x, me.y - ownSpot.y) <= CIRCLE_SEATED_PX;
    const home = homeBuilding(currentLayout(), seat);
    const atHome = !!home && me.location === `bld:${home.id}`;
    const ctl = driver.control;
    publish({
      control: ctl ? ctl.mode : 'free',
      goal: ctl?.mode === 'auto' ? (ctl.goal ?? null) : null,
      ownSpot: ownSpot ? { x: ownSpot.x, y: ownSpot.y } : null,
      seated,
      homeDoor,
      atHome,
    });

    if (!view || NIGHT.has(view.phase)) return out;
    const nom = votingNomination(view);
    const seatSpot = (s: number) => spotsFor(view).find((x) => x.seat === s) ?? null;

    // ---- raised hands above visible voters (any location; only who we can actually see)
    if (nom) {
      const locked = new Set(Object.entries(nom.votes).filter(([, v]) => v === true).map(([k]) => Number(k)));
      const raised = new Set((nom.handsRaised ?? []).filter((s) => !locked.has(s)));
      for (const p of view.players) {
        const isLocked = locked.has(p.seat);
        if (!isLocked && !raised.has(p.seat)) continue;
        let pos: { x: number; y: number } | null = null;
        if (p.pid === myPid) pos = me;
        else {
          const e = remoteEntities.get(p.pid);
          if (e && e.location === me.location) pos = e;
        }
        if (!pos) continue;
        const h = (handPool[out.hands.length] ??= { seat: 0, pid: '', x: 0, y: 0, locked: false });
        h.seat = p.seat;
        h.pid = p.pid;
        h.x = pos.x;
        h.y = pos.y;
        h.locked = isLocked;
        out.hands.push(h);
      }
    }

    if (!outdoors) return out;

    // ---- seat markers (gathered circle)
    if (gathering) {
      const deadSeats = new Set(view.players.filter((p) => !p.alive).map((p) => p.seat));
      for (const s of spotsFor(view)) {
        const m = (markerPool[out.markers.length] ??= { seat: 0, x: 0, y: 0, mine: false, dead: false });
        m.seat = s.seat;
        m.x = s.x;
        m.y = s.y;
        m.mine = s.seat === seat;
        m.dead = deadSeats.has(s.seat);
        out.markers.push(m);
      }
    }

    // ---- vote clock (shown even if not gathered: spots are still meaningful)
    if (nom && nom.currentVoterSeat !== null) {
      clockOut.voter = seatSpot(nom.currentVoterSeat);
      clockOut.nominee = seatSpot(nom.nomineeSeat);
      out.clock = clockOut;
    }

    // ---- personal hints (players only; never while the server is walking us)
    if (st || seat === null || driver.isActive()) return out;
    if (view.phase === 'bedtime' && homeDoor) {
      hintHome.door = homeDoor; // homeDoorOf already returns a fresh object (also published to gameplayState)
      hintHome.arrow = Math.hypot(me.x - homeDoor.x, me.y - homeDoor.y) > 20;
      out.hint = hintHome;
    } else if (gathering && ownSpot && !seated) {
      hintSeat.spot.x = ownSpot.x;
      hintSeat.spot.y = ownSpot.y;
      out.hint = hintSeat;
    }
    return out;
  };

  // ---------------------------------------------------------------------------------------

  let destroyed = false;
  return {
    frame,
    drive() {
      if (destroyed) return null;
      const me = ctx.me();
      const p = driver.pose(me);
      if (p) return { x: p.x, y: p.y, facing: p.facing, moving: p.moving };
      if (isPicking() || (holdPointer && ctx.amStoryteller())) return { x: me.x, y: me.y, facing: me.facing, moving: false };
      return null;
    },
    wantsLocalInput() {
      return !driver.isActive() && !isPicking() && !holdPointer;
    },
    doorOverrideVersion() {
      return doorsVersion;
    },
    doorOverride(buildingId) {
      const v = doors[buildingId];
      return v === undefined ? null : v;
    },
    isPicking,
    pickAt(x, y) {
      const pick = stagePick.get();
      if (destroyed || !pick || !ctx.amStoryteller()) return false;
      holdPointer = true;
      stagePick.set(null);
      pick.onPick(r(x), r(y));
      return true;
    },
    releasePointer() {
      holdPointer = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs) off();
      if (stagePick.get()) stagePick.set(null);
      gameplayState.set(INITIAL_GAMEPLAY_STATE);
    },
  };
}
