// Gameplay overlay for the town scene (gameplay subagent; placeholder art, restyled later by the
// art lead per docs/art-direction.md).
//
//   * drive()      server-driven local avatar (WorldSnapshot.you: 'auto' escort / 'frozen'),
//                  plus a hold-still while the Storyteller is picking a map point (pick.ts).
//   * markers      nomination-circle seat markers while the town is gathered (outdoors only),
//                  own spot pulsing gold, dead seats as pale wisps.
//   * vote clock   golden hand from the circle centre to the current voter, red ring on the nominee.
//   * hands        raised (bobbing outline) / locked-yes (solid) hands above visible voters.
//   * hints        bedtime: arrow toward your home door + pulsing door marker; gathering: arrow
//                  toward your seat spot. Players only, never the Storyteller.
//   * doorOverride Storyteller door locks / forced opens from WorldSnapshot.doors.
//
// Secrecy: everything is drawn from the viewer's own game view / snapshot (public data plus the
// viewer's own seat). Other avatars come from remoteEntities, which TownScene fills only with
// entities the server let us see; we additionally require the same location as ours. Nothing
// outdoors-related is drawn at night.
//
// TownScene hook contract (TownScene is owned by the art lead):
//   create():   this.gameplay = createGameplayLayer(this, { conn, myPid: () => this.myPid,
//                 me: () => this.me, amStoryteller: () => this.amStoryteller() });
//               this.offs.push(() => { this.gameplay?.destroy(); this.gameplay = null; });
//   stepLocal(): (top) const d = this.gameplay?.drive(dt); if (d) { …apply pose, no 'move'…; return; }
//   update():   after this.stepRemotes(): this.gameplay?.update(dt);
//   doorLocked(): const o = this.gameplay?.doorOverride(d.b.id);
//                 if (o !== null && o !== undefined && !this.amStoryteller()) return o;
import type * as Phaser from 'phaser';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
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
import { remoteEntities } from '../../net/localPlayer';
import { reducedMotion } from '../fx/motion';
import type { RoomConnection } from '../../net/room';
import { doorTagsStore, publishDoorTags } from './doorTags';
import { SelfDriver } from './drive';
import { stagePick } from './pick';
import { gameplayState, INITIAL_GAMEPLAY_STATE, type GameplayState } from './state';

export { gameplayState, INITIAL_GAMEPLAY_STATE, type GameplayState } from './state';
export { stagePick, type StagePick } from './pick';
export { doorTagsStore, MAX_ICONS, type DoorBoardView, type DoorTagView } from './doorTags';

export interface GameplayCtx {
  conn: RoomConnection;
  myPid(): string | null;
  /** TownScene's local predicted avatar state (feet px). */
  me(): { x: number; y: number; location: LocationId; facing: Facing };
  amStoryteller(): boolean;
}
export interface DrivenPose {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}
export interface GameplayLayer {
  /** Every frame, right after TownScene.stepRemotes(): markers, arrows, clock hand, raised hands. */
  update(dt: number): void;
  /** Called at the top of TownScene.stepLocal. Non-null => TownScene applies this pose to the local avatar
   *  instead of keyboard/pointer input and sends no 'move'. null => normal local control. */
  drive(dt: number): DrivenPose | null;
  /** !drive-active; convenience. */
  wantsLocalInput(): boolean;
  /** Storyteller door override for a building (from snapshot.doors): true locked, false forced open, null = phase default. */
  doorOverride(buildingId: string): boolean | null;
  /** Bumps whenever the door overrides change (TownScene refreshes its door prompt on change). */
  doorOverrideVersion(): number;
  destroy(): void;
}

type GameView = PlayerGameView | StorytellerGameView;

const NIGHT: ReadonlySet<GamePhase> = new Set(['first_night', 'night']);

// Placeholder palette (docs/art-direction.md master palette).
const GOLD = 0xd5b56a; // Focus gold
const PARCHMENT = 0xe4d8ba;
const INK = 0x211f2c; // Panel ink
const SOOT = 0x191c29;
const STONE = 0x505061; // Plum stone
const CHALK = 0xa39dab; // Chalk edge
const MIST = 0x8eb4c2; // Ghost mist
const SPIRIT = 0xcce1de; // Spirit light
const NOMINEE = 0xa65f4b; // Clay (reads as red on cobbles)

const DEPTH_GROUND = 3.5; // above AmbientLayer ground (3), below avatars (10 + y)
const DEPTH_GROUND_TEXT = 3.6;
const DEPTH_HANDS = 4002; // above every world sprite, below the lighting overlay (5000)
const DEPTH_HINTS = 5150; // above lighting (readable at dusk), below name labels (5200)
const HAND_LIFT = 30; // px above the feet
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

const r = Math.round;

export function createGameplayLayer(scene: Phaser.Scene, ctx: GameplayCtx): GameplayLayer {
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

  // Door tags are rendered by TownScene as bulletin boards (from doorTagsStore).
  offs.push(() => doorTagsStore.set({}));

  const ground = scene.add.graphics().setDepth(DEPTH_GROUND);
  const hands = scene.add.graphics().setDepth(DEPTH_HANDS);
  const hints = scene.add.graphics().setDepth(DEPTH_HINTS);
  const textRes = () => Math.max(1, Math.round(scene.cameras.main.zoom * (window.devicePixelRatio || 1)));
  const seatText = new Map<number, Phaser.GameObjects.Text>();
  const pickLabel = scene.add
    .text(0, 0, '', { fontFamily: LABEL_FONT, fontSize: '8px', color: '#e4d8ba', backgroundColor: 'rgba(33,31,44,0.85)', padding: { left: 2, right: 2, top: 0, bottom: 1 }, resolution: textRes() })
    .setDepth(DEPTH_HINTS + 1)
    .setVisible(false);

  // ---------------------------------------------------------------------------------------
  // Storyteller pick mode

  let holdPointer = false; // the click that picked is still held: keep the ST from walking toward it
  const isPicking = () => stagePick.get() !== null && ctx.amStoryteller();
  const onPointerDown = (p: Phaser.Input.Pointer) => {
    const pick = stagePick.get();
    if (!pick || !ctx.amStoryteller() || p.button !== 0) return;
    holdPointer = true;
    stagePick.set(null);
    // Resolve through the world camera explicitly: the overlay camera also receives input.
    const world = scene.cameras.main.getWorldPoint(p.x, p.y);
    pick.onPick(r(world.x), r(world.y));
  };
  const onPointerUp = () => (holdPointer = false);
  scene.input.on('pointerdown', onPointerDown);
  scene.input.on('pointerup', onPointerUp);
  scene.input.on('pointerupoutside', onPointerUp);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && stagePick.get()) {
      e.preventDefault();
      stagePick.set(null);
    }
  };
  window.addEventListener('keydown', onKey);
  offs.push(() => {
    scene.input.off('pointerdown', onPointerDown);
    scene.input.off('pointerup', onPointerUp);
    scene.input.off('pointerupoutside', onPointerUp);
    window.removeEventListener('keydown', onKey);
  });

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
  // drawing primitives (integer coords for pixel-crisp placeholders)

  /** Small arrow at `dist` px from (x,y) pointing toward (tx,ty). */
  const arrow = (g: Phaser.GameObjects.Graphics, x: number, y: number, tx: number, ty: number, t: number) => {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const dist = 14 + Math.sin(t * 6) * 1.5;
    const cx = x + ux * dist;
    const cy = y - 4 + uy * dist;
    const tip = { x: r(cx + ux * 5), y: r(cy + uy * 5) };
    const a = { x: r(cx - ux * 3 - uy * 4), y: r(cy - uy * 3 + ux * 4) };
    const b = { x: r(cx - ux * 3 + uy * 4), y: r(cy - uy * 3 - ux * 4) };
    g.fillStyle(GOLD, 1);
    g.fillTriangle(tip.x, tip.y, a.x, a.y, b.x, b.y);
    g.lineStyle(1, SOOT, 0.9);
    g.strokeTriangle(tip.x, tip.y, a.x, a.y, b.x, b.y);
  };

  /** A tiny pixel hand (7x11) with its wrist at (cx, bottom). */
  const hand = (g: Phaser.GameObjects.Graphics, cx: number, bottom: number, solid: boolean) => {
    const x0 = r(cx) - 3;
    const top = r(bottom) - 11;
    const rects: [number, number, number, number][] = [
      [x0, top + 1, 1, 4], // fingers
      [x0 + 2, top, 1, 5],
      [x0 + 4, top, 1, 5],
      [x0 + 6, top + 1, 1, 4],
      [x0, top + 5, 7, 4], // palm
      [x0 + 1, top + 9, 5, 2], // wrist
    ];
    // contour first (1 px Soot all around), then the fill
    g.fillStyle(SOOT, 0.9);
    for (const [x, y, w, h] of rects) g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(solid ? GOLD : PARCHMENT, solid ? 1 : 0.9);
    for (const [x, y, w, h] of rects) g.fillRect(x, y, w, h);
    if (!solid) {
      g.fillStyle(GOLD, 1); // gold cuff marks "raised, not yet counted"
      g.fillRect(x0 + 1, top + 9, 5, 1);
    }
  };

  const seatLabel = (seat: number, x: number, y: number, color: string) => {
    let t = seatText.get(seat);
    if (!t) {
      t = scene.add
        .text(0, 0, String(seat + 1), { fontFamily: LABEL_FONT, fontSize: '8px', fontStyle: '700', color, resolution: textRes() })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH_GROUND_TEXT);
      seatText.set(seat, t);
    }
    // setColor re-renders the text canvas + re-uploads its texture: only on change
    if (t.style.color !== color) t.setColor(color);
    t.setPosition(r(x), r(y)).setVisible(true);
  };

  // ---------------------------------------------------------------------------------------
  // per-frame

  let clockAng: number | null = null;
  let clockLen = 0;

  const update = (dt: number) => {
    // Keep directions and vote state readable without pulsing/bobbing for reduced motion.
    const t = reducedMotion() ? 0 : performance.now() / 1000;
    const view = conn.gameView.get();
    const me = ctx.me();
    const myPid = ctx.myPid();
    const st = ctx.amStoryteller();
    ground.clear();
    hands.clear();
    hints.clear();
    for (const txt of seatText.values()) txt.setVisible(false);

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

    // ---- Storyteller pick crosshair (any phase, any location)
    if (isPicking()) {
      const p = scene.input.activePointer;
      const w = scene.cameras.main.getWorldPoint(p.x, p.y);
      const x = r(w.x);
      const y = r(w.y);
      hints.lineStyle(1, SOOT, 0.9);
      hints.strokeCircle(x, y, 6);
      hints.lineStyle(1, GOLD, 1);
      hints.strokeCircle(x, y, 5);
      hints.fillStyle(GOLD, 1);
      for (const [dx, dy, ww, hh] of [[-9, 0, 5, 1], [5, 0, 5, 1], [0, -9, 1, 5], [0, 5, 1, 5]] as const) hints.fillRect(x + dx, y + dy, ww, hh);
      hints.fillRect(x, y, 1, 1);
      pickLabel.setText(stagePick.get()!.label).setPosition(x + 9, y + 6).setVisible(true);
    } else pickLabel.setVisible(false);

    if (!view || NIGHT.has(view.phase)) {
      clockAng = null;
      return;
    }
    const nom = votingNomination(view);
    const seatSpot = (s: number) => (view ? spotsFor(view).find((x) => x.seat === s) : undefined);

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
        const bob = isLocked ? 0 : Math.round(Math.sin(t * 5 + p.seat) * 1.5);
        hand(hands, pos.x + 7, pos.y - HAND_LIFT + 11 + bob, isLocked);
      }
    }

    if (!outdoors) {
      clockAng = null;
      return;
    }

    // ---- seat markers (gathered circle)
    if (gathering) {
      const deadSeats = new Set(view.players.filter((p) => !p.alive).map((p) => p.seat));
      for (const s of spotsFor(view)) {
        const x = r(s.x);
        const y = r(s.y);
        const mine = s.seat === seat;
        const dead = deadSeats.has(s.seat);
        if (mine) {
          const k = (Math.sin(t * 4) + 1) / 2;
          ground.fillStyle(GOLD, 0.18 + 0.2 * k);
          ground.fillEllipse(x, y, 22 + r(4 * k), 12 + r(2 * k));
        }
        ground.fillStyle(SOOT, 0.55);
        ground.fillEllipse(x, y + 1, 16, 9); // contact shadow
        ground.fillStyle(dead ? MIST : STONE, dead ? 0.75 : 1);
        ground.fillEllipse(x, y, 14, 8);
        ground.lineStyle(1, mine ? GOLD : dead ? SPIRIT : CHALK, 1);
        ground.strokeEllipse(x, y, 14, 8);
        if (dead) {
          // pale wisp rising from the stone
          const sway = Math.round(Math.sin(t * 2 + s.seat) * 1);
          ground.fillStyle(SPIRIT, 0.65);
          ground.fillEllipse(x + sway, y - 7, 6, 7);
          ground.fillTriangle(x - 2 + sway, y - 9, x + 2 + sway, y - 9, x + 2 * sway, y - 15);
        }
        seatLabel(s.seat, x, y, dead ? '#211f2c' : mine ? '#d5b56a' : '#e4d8ba');
      }
    }

    // ---- vote clock hand (drawn even if not gathered: spots are still meaningful)
    if (nom && nom.currentVoterSeat !== null) {
      const voter = seatSpot(nom.currentVoterSeat);
      const nominee = seatSpot(nom.nomineeSeat);
      if (nominee) {
        ground.lineStyle(2, NOMINEE, 1);
        ground.strokeEllipse(r(nominee.x), r(nominee.y), 20, 11);
      }
      if (voter) {
        const target = Math.atan2(voter.y - centre.y, voter.x - centre.x);
        const len = Math.max(0, Math.hypot(voter.x - centre.x, voter.y - centre.y) - 10);
        if (clockAng === null) {
          clockAng = target;
          clockLen = len;
        } else {
          let diff = target - clockAng;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const k = Math.min(1, dt * 7);
          clockAng += diff * k;
          clockLen += (len - clockLen) * k;
        }
        const ux = Math.cos(clockAng);
        const uy = Math.sin(clockAng);
        const ex = r(centre.x + ux * clockLen);
        const ey = r(centre.y + uy * clockLen);
        ground.lineStyle(5, SOOT, 0.8);
        ground.lineBetween(r(centre.x), r(centre.y), ex, ey);
        ground.lineStyle(3, GOLD, 1);
        ground.lineBetween(r(centre.x), r(centre.y), ex, ey);
        ground.fillStyle(GOLD, 1);
        ground.fillTriangle(r(ex + ux * 6), r(ey + uy * 6), r(ex - uy * 4), r(ey + ux * 4), r(ex + uy * 4), r(ey - ux * 4));
        ground.fillStyle(INK, 1);
        ground.fillCircle(r(centre.x), r(centre.y), 3);
        const pulse = (Math.sin(t * 6) + 1) / 2;
        ground.lineStyle(2, GOLD, 0.6 + 0.4 * pulse);
        ground.strokeEllipse(r(voter.x), r(voter.y), 22 + r(2 * pulse), 12 + r(pulse));
      }
    } else clockAng = null;

    // ---- personal hints (players only; never while the server is walking us)
    if (st || seat === null || driver.isActive()) return;
    if (view.phase === 'bedtime' && homeDoor) {
      const k = (Math.sin(t * 4) + 1) / 2;
      const dx = r(homeDoor.x);
      const dy = r(homeDoor.y);
      hints.lineStyle(1, GOLD, 0.5 + 0.5 * k);
      hints.strokeEllipse(dx, dy - 2, 18 + r(4 * k), 9 + r(2 * k));
      const by = dy - 26 - r(2 * k); // bobbing chevron over the door
      hints.fillStyle(SOOT, 0.9);
      hints.fillTriangle(dx - 5, by - 1, dx + 5, by - 1, dx, by + 5);
      hints.fillStyle(GOLD, 1);
      hints.fillTriangle(dx - 4, by, dx + 4, by, dx, by + 4);
      if (Math.hypot(me.x - homeDoor.x, me.y - homeDoor.y) > 20) arrow(hints, me.x, me.y, homeDoor.x, homeDoor.y, t);
    } else if (gathering && ownSpot && !seated) {
      arrow(hints, me.x, me.y, ownSpot.x, ownSpot.y, t);
    }
  };

  // ---------------------------------------------------------------------------------------

  let destroyed = false;
  return {
    update(dt) {
      if (!destroyed) update(dt);
    },
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs) off();
      ground.destroy();
      hands.destroy();
      hints.destroy();
      pickLabel.destroy();
      for (const txt of seatText.values()) txt.destroy();
      seatText.clear();
      if (stagePick.get()) stagePick.set(null);
      gameplayState.set(INITIAL_GAMEPLAY_STATE);
    },
  };
}
