// v3 WP1 (v3-core). The viewer's own avatar in the 3D town (docs/v3/INTEGRATION.md §3 "Own avatar + prediction",
// "Doors", "Tap-to-walk routes", "Escape"): the same rules as TownScene, over the extracted renderer-free rules.
//
//   prediction   keys or a tap route -> PLAYER_SPEED (× the Storyteller's travel multiplier), tile collision,
//                never into another location (game/rules/movement.ts integrateStep)
//   server walk  gameplay core drive(): the server walks / freezes us (bedtime escort, "walk to"), no moves sent
//   moves        15 Hz while the pose changed, seq fencing: a 'correction' teleport older than the fence is
//                ignored, every other teleport snaps (and fences); snapshots adopt ackSeq (a rejoined page)
//   doors        auto-enter when pushing into a doorway (rules/doors.ts autoEnterDoor), the inside exit gate
//                (interior.ts pushesOut + ExitGate), enter / leave with the anti-bounce cooldown and the lock
//                rules (Storyteller overrides from the gameplay core); door cue on a door teleport
//   routes       outdoor goTo (findPath, the v2 "+6 px" body aim; outdoors only, as v2), interior routes; arriving
//                at a cottage's door calls enter() (the lock rules / the server decide, as v2's stepLocal)
//   HUD          door prompt (+ 2.2 s flash for locked / empty doors), the "Inside …" panel, Leave button
//   stores       localPlayer (get() always current; subscribers at most every LOCAL_PUBLISH_MS)
//
// Pure logic; the network, cues and clock are injected (unit tested without a browser).
import { tileCenterPx, type BuildingDef, type Facing, type LobbyRoomView, type LocationId, type PlayerGameView, type StorytellerGameView, type TownLayout, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import type { Cue } from '../../game/audio';
import type { GameplayCore } from '../../game/gameplay/core';
import { ExitGate, interiorRoute, pushesOut, type InteriorTap } from '../../game/interior';
import { findPath } from '../../game/path';
import { autoEnterDoor, doorLocked, doorPrompt, doorSpots, houseInUse, lockText, type DoorRuleCtx, type DoorSpot } from '../../game/rules/doors';
import { dir8, fromFacing, toFacing, type Dir8 } from '../../game/rules/input';
import { integrateStep, LOCAL_PUBLISH_MS, MOVE_HZ, moveSpeed, poseChanged, routeStep, wirePx, type Route, type SentPose } from '../../game/rules/movement';
import type { TownBridge } from '../../game/TownScene';
import { localPlayer } from '../../net/localPlayer';
import type { RoomConnection } from '../../net/room';
import type { DoorEvent } from './remotes';

export type GameView = PlayerGameView | StorytellerGameView;

/** Anti-bounce: after asking to enter, further door attempts wait this long (ms). */
export const ENTER_COOLDOWN_MS = 900;
/** After asking to leave (ms). */
export const LEAVE_COOLDOWN_MS = 600;
/** A locked / empty door's prompt stays this long (ms). */
export const FLASH_MS = 2200;

export interface Me {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  location: LocationId;
}

export interface PlacedEvent {
  from: { x: number; y: number; location: LocationId };
  to: { x: number; y: number; location: LocationId };
  /** The teleport reason; 'snapshot' = first placement from a snapshot. */
  reason: WorldTeleport['reason'] | 'snapshot';
}

export interface LocalCtx {
  conn: Pick<RoomConnection, 'send'>;
  layout: TownLayout;
  bridge: Pick<TownBridge, 'setPrompt' | 'setInside' | 'registerLeave'>;
  myPid(): string | null;
  lobby(): LobbyRoomView | null;
  game(): GameView | null;
  /** Server-driven walk / freeze, door overrides, pick hold (null in tests without it). */
  gameplay: Pick<GameplayCore, 'drive' | 'wantsLocalInput' | 'doorOverride'> | null;
  /** Other pids in a location, display order (the "Inside … with …" panel). */
  occupants(location: LocationId): string[];
  playCue(c: Cue): void;
  now(): number;
  /** Placement / teleport (own poof, camera reset). */
  onPlaced?(e: PlacedEvent): void;
  /** Own door use (the door art opens). */
  onDoor?(e: DoorEvent): void;
}

export interface LocalController {
  readonly me: Me;
  /** 8-way display direction. */
  readonly dir: Dir8;
  /** Placed by the server at least once. */
  readonly ready: boolean;
  /** Following a tap route. */
  readonly routing: boolean;
  onTeleport(t: WorldTeleport): void;
  /** The viewer's slice of a snapshot: ackSeq + the first placement. Call before the remotes ingest it. */
  onSnapshot(s: WorldSnapshot): void;
  /** One frame: `keys` = the held key vector (unnormalised), dt in s, now in ms. */
  step(dt: number, keys: { vx: number; vy: number }): void;
  /** Once per frame after step(): door prompt (+ flash expiry) and the "Inside …" panel. */
  updateHud(): void;
  /** A movement key went down: tap routes end. */
  keyPressed(): void;
  /** Walk outdoors to a tap target (and in, if `enter`). Outdoors only (inside: walkInside). */
  goTo(t: { x: number; y: number; enter: string | null }): void;
  /** Inside: walk to an interior tap (and out through the doorway if `exit`). */
  walkInside(t: InteriorTap): void;
  enter(buildingId: string): void;
  leave(): void;
  /** Turn toward a world point (pointing). */
  faceToward(x: number, y: number): void;
  /** The HUD prompt + inside panel inputs changed (views); the next frame re-derives them. */
  markDirty(): void;
  currentBuilding(): BuildingDef | undefined;
  amStoryteller(): boolean;
  mySeat(): number | null;
  doorRules(): DoorRuleCtx;
  readonly doors: readonly DoorSpot[];
  destroy(): void;
}

export function createLocalController(ctx: LocalCtx): LocalController {
  const { layout } = ctx;
  const doors = doorSpots(layout);
  const spawn = tileCenterPx(layout, layout.playerSpawn);
  const me: Me = { x: spawn.x, y: spawn.y, facing: 'down', moving: false, location: 'outdoors' };
  let dir: Dir8 = 'down';
  let ready = false;
  let seq = 0;
  let fenceSeq = 0;
  let lastSent: SentPose = { x: NaN, y: NaN, moving: false, facing: 'down' };
  let lastSentAt = -Infinity;
  let enterCooldownUntil = 0;
  let route: Route | null = null;
  const exitGate = new ExitGate();
  let lastPromptKey = '';
  let flashUntil = 0;
  let lastInsideKey = '';
  let dirty = true;
  let destroyed = false;
  const lastPublish = { x: NaN, y: NaN, loc: '', at: -Infinity, pid: null as string | null };

  const amStoryteller = () => ctx.game()?.kind === 'storyteller' || !!ctx.lobby()?.members.find((m) => m.pid === ctx.myPid() && m.role === 'storyteller');
  const mySeat = () => {
    const g = ctx.game();
    if (g?.kind === 'player') return g.you.seat;
    return ctx.lobby()?.members.find((m) => m.pid === ctx.myPid())?.seat ?? null;
  };
  const phase = () => ctx.game()?.phase ?? (ctx.lobby()?.lobby.phase === 'finished' ? 'finished' : 'waiting');
  const override = (id: string) => ctx.gameplay?.doorOverride(id) ?? null;
  const doorRules = (): DoorRuleCtx => ({ layout, amStoryteller: amStoryteller(), phase: phase(), mySeat: mySeat(), override });
  /** The per-frame prompt's rules (refreshed in place) and its door callbacks (made once): no per-frame garbage. */
  const promptRules: DoorRuleCtx = { layout, amStoryteller: false, phase: 'waiting', mySeat: null, override };
  const promptOpts = {
    amStoryteller: false,
    inUse: (b: BuildingDef) => houseInUse(ctx.game(), b),
    locked: (b: BuildingDef) => doorLocked(promptRules, b, false),
    lockText: (b: BuildingDef) => lockText(promptRules, b, false),
    title: (b: BuildingDef) => houseTitle(b),
  };
  const currentBuilding = () => (me.location === 'outdoors' ? undefined : layout.buildings.find((b) => `bld:${b.id}` === me.location));
  const houseTitle = (b: BuildingDef) => {
    const res = ctx.game()?.players.find((p) => p.seat === b.houseIndex);
    if (!res) return b.name;
    return res.pid === ctx.myPid() ? 'Your home' : `${res.name}’s home`;
  };

  // ------------------------------------------------------------------ network
  const sendMove = (moving: boolean) => {
    seq++;
    ctx.conn.send('move', { seq, x: wirePx(me.x), y: wirePx(me.y), facing: me.facing, moving });
    lastSent = { x: me.x, y: me.y, moving, facing: me.facing };
    lastSentAt = ctx.now();
  };
  const publishLocal = (force: boolean) => {
    const cur = localPlayer.get();
    const now = ctx.now();
    const pid = ctx.myPid();
    const moved = Math.abs(lastPublish.x - me.x) >= 0.5 || Math.abs(lastPublish.y - me.y) >= 0.5;
    if (force || lastPublish.loc !== me.location || cur.pid !== pid || lastPublish.pid !== pid || (moved && now - lastPublish.at >= LOCAL_PUBLISH_MS)) {
      Object.assign(lastPublish, { x: me.x, y: me.y, loc: me.location, at: now, pid });
      localPlayer.set({ pid, x: me.x, y: me.y, location: me.location });
      return;
    }
    // between notifications: keep the published object current (same object => no re-render)
    cur.x = me.x;
    cur.y = me.y;
  };
  const placeMe = (x: number, y: number, location: LocationId, reason: PlacedEvent['reason']) => {
    const from = { x: me.x, y: me.y, location: me.location };
    const prevLoc = me.location;
    const wasReady = ready;
    me.x = x;
    me.y = y;
    me.location = location;
    me.moving = false;
    ready = true;
    dirty = true;
    if (!wasReady || prevLoc !== location) onLocationChange();
    else publishLocal(true);
    ctx.onPlaced?.({ from, to: { x, y, location }, reason });
  };
  const onLocationChange = () => {
    route = null;
    exitGate.reset();
    publishLocal(true);
  };

  // ------------------------------------------------------------------ doors
  const flash = (text: string) => {
    ctx.bridge.setPrompt({ key: '', text, locked: true });
    lastPromptKey = 'flash';
    flashUntil = ctx.now() + FLASH_MS;
  };
  const enter = (id: string) => {
    const b = layout.buildings.find((x) => x.id === id);
    if (!b || !ready) return;
    const now = ctx.now();
    if (now < enterCooldownUntil) return;
    if (doorLocked(doorRules(), b, false)) return flash(lockText(doorRules(), b, false));
    enterCooldownUntil = now + ENTER_COOLDOWN_MS;
    route = null;
    // Moves go out at 15 Hz: flush the feet position first so the server does not judge the door range from
    // the previous one, still a step away from the doorstep (Isaac, PR #2).
    sendMove(false);
    ctx.conn.send('world:useDoor', { buildingId: b.id });
  };
  const leave = () => {
    const b = currentBuilding();
    if (!b || !ready) return;
    const now = ctx.now();
    if (now < enterCooldownUntil) return;
    if (doorLocked(doorRules(), b, true)) return flash(lockText(doorRules(), b, true));
    enterCooldownUntil = now + LEAVE_COOLDOWN_MS;
    ctx.conn.send('world:useDoor', { buildingId: b.id });
  };
  ctx.bridge.registerLeave?.(leave);

  // ------------------------------------------------------------------ routes
  const goTo = (t: { x: number; y: number; enter: string | null }) => {
    // outdoors only (v2): inside, taps resolve to interior routes (walkInside), the doorway one walks out
    if (!ready || me.location !== 'outdoors') return;
    if (ctx.gameplay && !ctx.gameplay.wantsLocalInput()) return;
    const goal = t.enter ? t : { ...t, y: t.y + 6 }; // a tap lands on a body more often than on its feet
    const pts = findPath(layout, { x: me.x, y: me.y }, { x: goal.x, y: goal.y }, 'outdoors');
    if (!pts) return;
    route = { pts, enter: t.enter };
  };
  const walkInside = (t: InteriorTap) => {
    const b = currentBuilding();
    if (!b || !ready) return;
    if (ctx.gameplay && !ctx.gameplay.wantsLocalInput()) return;
    const pts = interiorRoute(layout, b, { x: me.x, y: me.y }, t);
    if (pts) route = { pts, enter: t.exit ? b.id : null };
  };

  // ------------------------------------------------------------------ per frame
  const step = (dt: number, keys: { vx: number; vy: number }) => {
    if (!ready || destroyed) return;
    const d = ctx.gameplay?.drive() ?? null;
    if (d) {
      // the server walks / freezes us (or the Storyteller is picking a point): show its pose, send nothing
      me.x = d.x;
      me.y = d.y;
      me.facing = d.facing;
      me.moving = d.moving;
      if (d.moving) dir = fromFacing(d.facing);
      lastSent = { x: d.x, y: d.y, moving: false, facing: d.facing };
      route = null;
      publishLocal(false);
      return;
    }
    let { vx, vy } = keys;
    let following = false;
    if (vx === 0 && vy === 0 && route) {
      const r = routeStep(route, me, ctx.now() < enterCooldownUntil);
      if (r.kind === 'arrived') {
        const target = r.enter;
        route = null;
        if (target && currentBuilding()?.id === target) {
          // inside: a tap on the doorway walked us to the door spot; now out
          dir = 'down';
          leave();
        } else if (target) {
          const d0 = doors.find((x) => x.b.id === target);
          if (d0) {
            dir = dir8(d0.inward.x, d0.inward.y);
            enter(d0.b.id); // as v2: the lock rules / the server decide (no client-side "Nobody lives here" here)
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
      const g = ctx.game();
      let stepPx = moveSpeed(amStoryteller() && g?.kind === 'storyteller' ? g.travelSpeedMult : null) * dt;
      if (following) {
        const next = route?.pts[0];
        if (next) stepPx = Math.min(stepPx, Math.hypot(next.x - me.x, next.y - me.y));
      }
      moving = integrateStep(layout, me, vx, vy, stepPx).moved;
      dir = dir8(vx, vy);
      me.facing = toFacing(dir, vx, vy);
      if (following && !moving) route = null; // blocked: give up quietly
      if (!following) {
        const door = autoEnterDoor(me, vx, vy, doors);
        if (door) {
          if (!houseInUse(ctx.game(), door.b) && !amStoryteller()) flash('Nobody lives here');
          else enter(door.b.id);
        }
      }
    }
    if (me.location !== 'outdoors') tryWalkOut(following ? 0 : vx, following ? 0 : vy);
    me.moving = moving;
    if (poseChanged(me, lastSent) && ctx.now() - lastSentAt >= 1000 / MOVE_HZ) sendMove(moving);
    publishLocal(false);
  };
  const tryWalkOut = (vx: number, vy: number) => {
    const b = currentBuilding();
    if (!b || !ready || !pushesOut(layout, b, me, vx, vy)) return exitGate.reset();
    if (exitGate.try(ctx.now())) leave();
  };

  // ------------------------------------------------------------------ HUD
  const updatePrompt = () => {
    if (lastPromptKey === 'flash') {
      if (ctx.now() < flashUntil) return;
      lastPromptKey = '';
      ctx.bridge.setPrompt(null);
    }
    let p: { text: string; locked: boolean } | null = null;
    if (ready && me.location === 'outdoors' && !route) {
      promptRules.amStoryteller = promptOpts.amStoryteller = amStoryteller();
      promptRules.phase = phase();
      promptRules.mySeat = mySeat();
      p = doorPrompt(me, doors, promptOpts);
    }
    const key = p ? `${p.text}|${p.locked}` : '';
    if (key === lastPromptKey) return;
    lastPromptKey = key;
    ctx.bridge.setPrompt(p ? { key: '', text: p.text, locked: p.locked } : null);
  };
  const updateInside = () => {
    if (!dirty) return;
    dirty = false;
    const b = currentBuilding();
    if (!b) {
      if (lastInsideKey !== '') {
        lastInsideKey = '';
        ctx.bridge.setInside?.(null);
      }
      return;
    }
    const members = ctx.lobby()?.members ?? [];
    const others = ctx.occupants(me.location).map((pid) => members.find((m) => m.pid === pid)?.displayName ?? '…');
    const rules = doorRules();
    const locked = doorLocked(rules, b, true);
    const info = { buildingId: b.id, name: houseTitle(b), others, canLeave: !locked, ...(locked ? { lockedReason: lockText(rules, b, true) } : {}) };
    const key = JSON.stringify(info);
    if (key === lastInsideKey) return;
    lastInsideKey = key;
    ctx.bridge.setInside?.(info);
  };

  return {
    me,
    get dir() {
      return dir;
    },
    get ready() {
      return ready;
    },
    get routing() {
      return route !== null;
    },
    doors,
    onTeleport(t) {
      if (destroyed) return;
      // a rejoined page starts at seq 0, but the server keeps the last accepted sequence (cafb858)
      seq = Math.max(seq, t.seq);
      if (t.reason === 'correction' && t.seq <= fenceSeq) return;
      fenceSeq = seq;
      lastSent = { x: t.x, y: t.y, moving: false, facing: me.facing };
      const from = me.location;
      const changed = t.location !== from;
      if (t.reason !== 'correction') route = null;
      placeMe(t.x, t.y, t.location, t.reason);
      if (t.reason === 'door' && changed) {
        ctx.playCue('door');
        const pid = ctx.myPid();
        if (pid) {
          if (from === 'outdoors' && t.location !== 'outdoors') ctx.onDoor?.({ pid, buildingId: t.location.slice(4), kind: 'enter', seenFrom: 'outdoors' });
          else if (from !== 'outdoors' && t.location === 'outdoors') ctx.onDoor?.({ pid, buildingId: from.slice(4), kind: 'leave', seenFrom: from });
        }
      }
    },
    onSnapshot(s) {
      if (destroyed) return;
      seq = Math.max(seq, s.ackSeq);
      dirty = true;
      const pid = ctx.myPid();
      if (!ready && pid) {
        const mine = s.entities.find((e) => e.id === pid);
        if (mine) placeMe(mine.x, mine.y, mine.location, 'snapshot');
      }
    },
    step,
    updateHud() {
      if (destroyed) return;
      updatePrompt();
      updateInside();
    },
    keyPressed() {
      route = null;
    },
    goTo,
    walkInside,
    enter,
    leave,
    faceToward(x, y) {
      const vx = x - me.x;
      const vy = y - (me.y - 12);
      if (vx === 0 && vy === 0) return;
      dir = dir8(vx, vy);
    },
    markDirty() {
      dirty = true;
    },
    currentBuilding,
    amStoryteller,
    mySeat,
    doorRules,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ctx.bridge.registerLeave?.(null);
      ctx.bridge.setPrompt(null);
      ctx.bridge.setInside?.(null);
    },
  };
}
