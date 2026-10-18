// v3 WP1 (v3-core). The 3D town's net / input core without a browser (docs/v3/INTEGRATION.md §3, §6.2): remote
// interpolation, own prediction + moves + seq fencing, doors, routes, prompts, keys and pointer taps, the
// Scene3dState and the __ctCamera core members. Also: the WP1 modules never pull Phaser into the 3D chunk.
import { fileURLToPath } from 'node:url';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import { isBlockedPx, tileCenterPx, type LocationId, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importClosure } from '../support/importClosure';

type Listener = (e: unknown) => void;
const winListeners = new Map<string, Set<Listener>>();
const store = new Map<string, string>();
const fakeWindow = {
  addEventListener: (t: string, fn: Listener) => void (winListeners.get(t) ?? winListeners.set(t, new Set()).get(t)!).add(fn),
  removeEventListener: (t: string, fn: Listener) => void winListeners.get(t)?.delete(fn),
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  matchMedia: () => ({ matches: false }),
};
vi.stubGlobal('window', fakeWindow);
vi.stubGlobal('localStorage', fakeWindow.localStorage);
vi.stubGlobal('document', { activeElement: null, visibilityState: 'visible' });
const fire = (type: string, e: unknown) => {
  for (const fn of [...(winListeners.get(type) ?? [])]) fn(e);
};

const { RemoteTracker } = await import('../../src/game3d/net/remotes');
const { createLocalController, ENTER_COOLDOWN_MS, FLASH_MS } = await import('../../src/game3d/net/local');
const { createCore3d, voteState } = await import('../../src/game3d/net/core');
const { createKeyInput } = await import('../../src/game3d/input/keys');
const { createPointerInput } = await import('../../src/game3d/input/pointer');
const { remoteEntities, localPlayer } = await import('../../src/net/localPlayer');
const { Emitter, createStore } = await import('../../src/net/store');
const { stagePick } = await import('../../src/game/gameplay/pick');
const { setV3LayoutForTests, ensureLayout } = await import('../../src/net/layout');
const { INTERP_DELAY_MS, ST_JUMP_PX, MOVE_HZ, PLAYER_SPEED } = { ...(await import('../../src/game/rules/movement')), ...(await import('@ct/protocol')) };

const L = townLayoutV3;
const ME = 'p_me';
const OTHER = 'p_other';
const ST = 'p_st';

beforeEach(async () => {
  remoteEntities.clear();
  stagePick.set(null);
  store.clear();
  winListeners.clear();
  setV3LayoutForTests?.(L);
  await ensureLayout('v3');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ent = (id: string, x: number, y: number, location: LocationId = 'outdoors', moving = false) => ({ id, x, y, facing: 'down' as const, moving, location });
const snap = (entities: ReturnType<typeof ent>[], extra: Partial<WorldSnapshot> = {}): WorldSnapshot => ({ t: 0, ackSeq: 0, entities, ...extra });
const tp = (x: number, y: number, location: LocationId, reason: WorldTeleport['reason'], seq = 0): WorldTeleport => ({ x, y, location, reason, seq });

function lobbyView(o: { st?: boolean; phase?: string } = {}) {
  return {
    youPid: ME,
    lobby: { phase: o.phase ?? 'waiting' },
    members: [
      { pid: ME, displayName: 'Me', role: o.st ? 'storyteller' : 'player', seat: o.st ? null : 0, cosmetics: { preset: 'frog' } },
      { pid: OTHER, displayName: 'Other', role: 'player', seat: 1, cosmetics: { preset: 'fox' } },
      { pid: ST, displayName: 'Teller', role: 'storyteller', seat: null, cosmetics: { preset: null } },
    ],
  };
}

function fakeConn(o: { st?: boolean } = {}) {
  const events = new Emitter<Record<string, unknown>>();
  const lobby = createStore<unknown>(lobbyView(o));
  const game = createStore<unknown>(null);
  const sent: { type: string; payload: Record<string, unknown> }[] = [];
  return { events, lobbyView: lobby, gameView: game, sent, send: (type: string, payload: Record<string, unknown>) => void sent.push({ type, payload }) };
}

function fakeBridge(conn: ReturnType<typeof fakeConn>) {
  const prompts: (unknown | null)[] = [];
  const insides: (unknown | null)[] = [];
  let leave: (() => void) | null = null;
  return {
    bridge: { conn: conn as never, setPrompt: (p: unknown) => void prompts.push(p), setCaption: () => undefined, setInside: (i: unknown) => void insides.push(i), registerLeave: (fn: (() => void) | null) => void (leave = fn) },
    prompts,
    insides,
    leave: () => leave?.(),
  };
}

// ------------------------------------------------------------------------------------------------ remotes

describe('remote tracker', () => {
  const tracker = (here: LocationId = 'outdoors') => new RemoteTracker({ isStoryteller: (p) => p === ST, myLocation: () => here, ready: () => true });

  it('interpolates INTERP_DELAY_MS in the past and writes remoteEntities', () => {
    const r = tracker();
    r.ingest([ent(OTHER, 100, 100, 'outdoors', true)], ME, 1000);
    r.ingest([ent(OTHER, 200, 100, 'outdoors', true)], ME, 1100);
    r.step(1100 + INTERP_DELAY_MS - 50); // halfway between the two samples
    const p = r.poses().get(OTHER)!;
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.moving).toBe(true);
    expect(p.dir).toBe('right');
    expect(remoteEntities.get(OTHER)).toEqual({ x: p.x, y: 100, location: 'outdoors' });
    // stale after 600 ms without samples: standing
    r.step(1100 + 700);
    expect(r.poses().get(OTHER)!.moving).toBe(false);
    expect(r.poses().get(OTHER)!.stale).toBe(true);
  });

  it('a location change resets the samples (no slide) and is a door event; leaving the snapshot drops the remote', () => {
    const r = tracker();
    const doors: unknown[] = [];
    r.on('door', (e) => doors.push(e));
    r.ingest([ent(OTHER, 100, 100)], ME, 0);
    r.ingest([ent(OTHER, 900, 300, 'bld:house-5')], ME, 100);
    r.step(100 + INTERP_DELAY_MS + 5);
    expect(r.poses().get(OTHER)).toMatchObject({ x: 900, y: 300, location: 'bld:house-5' });
    expect(doors).toEqual([{ pid: OTHER, buildingId: 'house-5', kind: 'enter', seenFrom: 'outdoors' }]);
    r.ingest([ent(OTHER, 100, 100)], ME, 200);
    expect(doors[1]).toEqual({ pid: OTHER, buildingId: 'house-5', kind: 'leave', seenFrom: 'bld:house-5' });
    r.ingest([], ME, 300);
    expect(r.poses().has(OTHER)).toBe(false);
    expect(remoteEntities.has(OTHER)).toBe(false);
  });

  it('the Storyteller poofs: appearing here, a jump > ST_JUMP_PX (no slide), leaving', () => {
    const r = tracker();
    const poofs: { kind: string; x: number }[] = [];
    r.on('poof', (e) => poofs.push({ kind: e.kind, x: e.x }));
    r.ingest([ent(ST, 100, 100)], ME, 0);
    expect(poofs).toEqual([{ kind: 'in', x: 100 }]);
    r.step(INTERP_DELAY_MS + 1);
    r.ingest([ent(ST, 100 + ST_JUMP_PX + 10, 100)], ME, 50);
    expect(poofs.slice(1)).toEqual([
      { kind: 'out', x: 100 },
      { kind: 'in', x: 100 + ST_JUMP_PX + 10 },
    ]);
    r.step(60); // samples were reset: already at the new spot (no slide across)
    expect(r.poses().get(ST)!.x).toBe(100 + ST_JUMP_PX + 10);
    r.ingest([], ME, 100);
    expect(poofs.at(-1)).toMatchObject({ kind: 'out' });
    // a player jump is a slide, no poof
    const n = poofs.length;
    r.ingest([ent(OTHER, 0, 0)], ME, 200);
    r.ingest([ent(OTHER, 300, 0)], ME, 250);
    expect(poofs.length).toBe(n);
  });

  it('occupant order: the Storyteller last, then by pid', () => {
    const r = tracker();
    r.ingest([ent(ST, 1, 1, 'bld:house-1'), ent('p_b', 1, 1, 'bld:house-1'), ent('p_a', 1, 1, 'bld:house-1'), ent('p_c', 1, 1)], ME, 0);
    expect(r.inLocation('bld:house-1')).toEqual(['p_a', 'p_b', ST]);
  });
});

// ------------------------------------------------------------------------------------------------ local

function localSetup(o: { st?: boolean } = {}) {
  const conn = fakeConn(o);
  const b = fakeBridge(conn);
  let now = 10_000;
  const cues: string[] = [];
  const placed: unknown[] = [];
  const doorsUsed: unknown[] = [];
  const driven = { pose: null as null | { x: number; y: number; facing: 'down'; moving: boolean } };
  const overrides: Record<string, boolean> = {};
  const lc = createLocalController({
    conn: conn as never,
    layout: L,
    bridge: b.bridge as never,
    myPid: () => ME,
    lobby: () => conn.lobbyView.get() as never,
    game: () => conn.gameView.get() as never,
    gameplay: { drive: () => driven.pose, wantsLocalInput: () => !driven.pose, doorOverride: (id) => overrides[id] ?? null },
    occupants: () => [OTHER],
    playCue: (c) => void cues.push(c),
    now: () => now,
    onPlaced: (e) => void placed.push(e),
    onDoor: (e) => void doorsUsed.push(e),
  });
  return { conn, b, lc, cues, placed, doorsUsed, driven, overrides, tick: (ms: number) => (now += ms), now: () => now };
}

/** A free outdoor spot with free space to the right. */
function freeSpot(): { x: number; y: number } {
  for (let ty = 20; ty < 40; ty++)
    for (let tx = 5; tx < 40; tx++) {
      const p = tileCenterPx(L, { x: tx, y: ty });
      let ok = true;
      for (let k = 0; k <= 64 && ok; k += 4) ok = !isBlockedPx(L, p.x + k, p.y) && !isBlockedPx(L, p.x + k, p.y + 6) && !L.buildings.some((b) => Math.hypot(p.x + k - tileCenterPx(L, b.door).x, p.y - tileCenterPx(L, b.door).y) < 40);
      if (ok) return p;
    }
  throw new Error('no free spot');
}

describe('local controller: prediction, moves, fencing', () => {
  it('walks with keys at PLAYER_SPEED, sends moves at most at MOVE_HZ, publishes localPlayer', () => {
    const s = localSetup();
    const p = freeSpot();
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'spawn', 0));
    expect(s.lc.ready).toBe(true);
    expect(localPlayer.get()).toMatchObject({ pid: ME, x: p.x, y: p.y, location: 'outdoors' });
    for (let i = 0; i < 30; i++) {
      s.tick(1000 / 60);
      s.lc.step(1 / 60, { vx: 1, vy: 0 });
    }
    expect(s.lc.me.x).toBeCloseTo(p.x + PLAYER_SPEED * 0.5, 0);
    expect(s.lc.me.facing).toBe('right');
    expect(s.lc.dir).toBe('right');
    const moves = s.conn.sent.filter((m) => m.type === 'move');
    expect(moves.length).toBeGreaterThan(5);
    expect(moves.length).toBeLessThanOrEqual(Math.ceil(0.5 * MOVE_HZ) + 1);
    expect(moves.map((m) => m.payload.seq)).toEqual(moves.map((_, i) => i + 1));
    expect(localPlayer.get().x).toBeCloseTo(s.lc.me.x, 6);
  });

  it('a stale correction is ignored, a fresh one snaps; snapshots adopt ackSeq (rejoin)', () => {
    const s = localSetup();
    const p = freeSpot();
    s.lc.onSnapshot(snap([ent(ME, p.x, p.y)], { ackSeq: 40 }));
    expect(s.lc.ready).toBe(true);
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'spawn', 40)); // fence = 40
    s.tick(100);
    s.lc.step(0.05, { vx: 1, vy: 0 });
    const seq = s.conn.sent.filter((m) => m.type === 'move').at(-1)!.payload.seq as number;
    expect(seq).toBe(41);
    const x = s.lc.me.x;
    s.lc.onTeleport(tp(1, 1, 'outdoors', 'correction', 40)); // older than our latest move: ignored
    expect(s.lc.me.x).toBe(x);
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'correction', 41));
    expect(s.lc.me.x).toBe(p.x);
  });

  it('the server walk (gameplay drive) moves us without sending moves', () => {
    const s = localSetup();
    const p = freeSpot();
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'spawn'));
    s.driven.pose = { x: p.x + 5, y: p.y, facing: 'down', moving: true };
    const before = s.conn.sent.length;
    s.tick(100);
    s.lc.step(0.1, { vx: 1, vy: 0 });
    expect(s.lc.me.x).toBe(p.x + 5);
    expect(s.conn.sent.length).toBe(before);
  });
});

describe('local controller: doors, routes, HUD', () => {
  const b5 = L.buildings.find((b) => b.id === 'house-5')!;
  const d5 = tileCenterPx(L, b5.door);
  const inward = { x: -b5.doorNormal![0], y: -b5.doorNormal![1] };

  it('pushing into a doorway enters (move flushed first); the cooldown blocks a bounce; door teleport = cue + door event', () => {
    const s = localSetup();
    s.lc.onTeleport(tp(d5.x, d5.y, 'outdoors', 'spawn'));
    s.tick(20);
    s.lc.step(1 / 60, { vx: inward.x, vy: inward.y });
    const used = s.conn.sent.filter((m) => m.type === 'world:useDoor');
    expect(used).toEqual([{ type: 'world:useDoor', payload: { buildingId: 'house-5' } }]);
    const idx = s.conn.sent.findIndex((m) => m.type === 'world:useDoor');
    expect(s.conn.sent[idx - 1]!.type).toBe('move');
    s.tick(ENTER_COOLDOWN_MS - 100);
    s.lc.step(1 / 60, { vx: inward.x, vy: inward.y });
    expect(s.conn.sent.filter((m) => m.type === 'world:useDoor').length).toBe(1);
    const inside = tileCenterPx(L, b5.interiorDoor);
    s.lc.onTeleport(tp(inside.x, inside.y, 'bld:house-5', 'door'));
    expect(s.cues).toEqual(['door']);
    expect(s.doorsUsed).toEqual([{ pid: ME, buildingId: 'house-5', kind: 'enter', seenFrom: 'outdoors' }]);
    // the inside panel
    s.lc.updateHud();
    expect(s.b.insides.at(-1)).toMatchObject({ buildingId: 'house-5', others: ['Other'], canLeave: true });
    // Leave button (bridge) and walking down out of the doorway (held)
    s.tick(ENTER_COOLDOWN_MS);
    s.b.leave();
    expect(s.conn.sent.filter((m) => m.type === 'world:useDoor').length).toBe(2);
  });

  it('locked at night: the prompt says so and entering flashes instead of sending', () => {
    const s = localSetup();
    s.conn.gameView.set({ kind: 'player', phase: 'night', players: [{ pid: ME, seat: 0, alive: true, name: 'Me' }, { pid: OTHER, seat: 5, alive: true, name: 'Other' }], you: { pid: ME, seat: 0, alive: true }, day: null });
    s.lc.onTeleport(tp(d5.x, d5.y, 'outdoors', 'spawn'));
    s.lc.updateHud();
    expect(s.b.prompts.at(-1)).toMatchObject({ text: 'Locked for the night', locked: true });
    s.lc.enter('house-5');
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor')).toBe(false);
    s.tick(FLASH_MS + 10);
    s.lc.updateHud();
    expect(s.b.prompts.at(-1)).toMatchObject({ text: 'Locked for the night' });
  });

  it('a Storyteller door override opens a night door', () => {
    const s = localSetup();
    s.conn.gameView.set({ kind: 'player', phase: 'night', players: [{ pid: OTHER, seat: 5, alive: true, name: 'Other' }], you: { pid: ME, seat: 0, alive: true }, day: null });
    s.overrides['house-5'] = false;
    s.lc.onTeleport(tp(d5.x, d5.y, 'outdoors', 'spawn'));
    s.lc.enter('house-5');
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor')).toBe(true);
  });

  it('a tap route walks to a cottage and in; a key press cancels a route', () => {
    const s = localSetup();
    const start = { x: d5.x - b5.doorNormal![0] * 64, y: d5.y - b5.doorNormal![1] * -64 };
    const p = isBlockedPx(L, start.x, start.y) ? freeSpot() : start;
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'spawn'));
    s.lc.goTo({ x: d5.x, y: d5.y, enter: 'house-5' });
    expect(s.lc.routing).toBe(true);
    for (let i = 0; i < 600 && !s.conn.sent.some((m) => m.type === 'world:useDoor'); i++) {
      s.tick(1000 / 60);
      s.lc.step(1 / 60, { vx: 0, vy: 0 });
    }
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor' && m.payload.buildingId === 'house-5')).toBe(true);
    s.lc.goTo({ x: p.x, y: p.y, enter: null });
    s.lc.keyPressed();
    expect(s.lc.routing).toBe(false);
  });

  it('goTo is outdoors only (v2): inside it neither leaves nor leaves a stale target for later', () => {
    const s = localSetup();
    const inside = tileCenterPx(L, b5.interiorDoor);
    s.lc.onTeleport(tp(inside.x, inside.y, 'bld:house-5', 'spawn'));
    const goal = freeSpot();
    s.lc.goTo({ x: goal.x, y: goal.y, enter: null });
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor')).toBe(false);
    s.lc.onTeleport(tp(d5.x, d5.y, 'outdoors', 'door')); // out, much later, by any route
    expect(s.lc.routing).toBe(false);
  });

  it('a tap route that arrives at an empty cottage asks to enter, as v2 (the lock rules / the server decide)', () => {
    const s = localSetup();
    s.conn.gameView.set({ kind: 'player', phase: 'day', players: [{ pid: ME, seat: 0, alive: true, name: 'Me' }], you: { pid: ME, seat: 0, alive: true }, day: { nominations: [] } });
    const start = { x: d5.x - b5.doorNormal![0] * 64, y: d5.y - b5.doorNormal![1] * -64 };
    const p = isBlockedPx(L, start.x, start.y) ? freeSpot() : start;
    s.lc.onTeleport(tp(p.x, p.y, 'outdoors', 'spawn'));
    s.lc.goTo({ x: d5.x, y: d5.y, enter: 'house-5' });
    for (let i = 0; i < 600 && s.lc.routing; i++) {
      s.tick(1000 / 60);
      s.lc.step(1 / 60, { vx: 0, vy: 0 });
    }
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor' && m.payload.buildingId === 'house-5')).toBe(true);
  });

  it('an empty cottage is not entered by players', () => {
    const s = localSetup();
    s.conn.gameView.set({ kind: 'player', phase: 'day', players: [{ pid: ME, seat: 0, alive: true, name: 'Me' }], you: { pid: ME, seat: 0, alive: true }, day: { nominations: [] } });
    s.lc.onTeleport(tp(d5.x, d5.y, 'outdoors', 'spawn'));
    s.lc.updateHud();
    expect(s.b.prompts.at(-1)).toMatchObject({ text: 'Nobody lives here', locked: true });
    s.lc.step(1 / 60, { vx: inward.x, vy: inward.y });
    expect(s.conn.sent.some((m) => m.type === 'world:useDoor')).toBe(false);
  });

  it('destroy clears the HUD and the Leave registration', () => {
    const s = localSetup();
    s.lc.destroy();
    expect(s.b.prompts.at(-1)).toBeNull();
    expect(s.b.insides.at(-1)).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ input

function fakeEl() {
  const ls = new Map<string, Set<Listener>>();
  return {
    style: {} as Record<string, string>,
    addEventListener: (t: string, fn: Listener) => void (ls.get(t) ?? ls.set(t, new Set()).get(t)!).add(fn),
    removeEventListener: (t: string, fn: Listener) => void ls.get(t)?.delete(fn),
    fire: (t: string, e: unknown) => [...(ls.get(t) ?? [])].forEach((fn) => fn(e)),
    count: () => [...ls.values()].reduce((n, s) => n + s.size, 0),
  };
}
/** A drawn scene for the core (camera calls recorded; no three renderer). */
function fakeScene() {
  const sets: unknown[] = [];
  return {
    host: {
      engine: { width: 1280, height: 720, pixelScale: 1, camera: { set: (o: unknown) => void sets.push(o), texelWorld: 0.05 } },
      projection: () => null as never,
      info: () => ({ calls: 1, tris: 2, programs: 3, pixelScale: 1, lowW: 640, lowH: 360 }),
      gpu: () => null,
    },
    heightAt: () => 0,
    sets,
  };
}
const ptr = (o: Partial<PointerEvent> = {}) => ({ pointerId: 1, button: 0, clientX: 50, clientY: 60, pointerType: 'mouse', shiftKey: false, target: null, preventDefault: () => undefined, type: 'pointerdown', ...o });

describe('keys + pointer', () => {
  it('keys: vector, typing ignored, Escape leaves unless picking, blur releases', () => {
    const t = fakeEl();
    let esc = 0;
    let moved = 0;
    let picking = false;
    const k = createKeyInput({ onMoveKey: () => moved++, onEscape: () => esc++, picking: () => picking, typing: (e) => (e as unknown as { typing?: boolean }).typing === true }, t as never);
    const key = (code: string, typing = false) => ({ code, typing, preventDefault: () => undefined });
    t.fire('keydown', key('KeyD'));
    t.fire('keydown', key('ArrowUp'));
    expect(k.vector()).toEqual({ vx: 1, vy: -1 });
    expect(moved).toBe(2);
    t.fire('keydown', key('KeyA', true));
    expect(k.vector()).toEqual({ vx: 1, vy: -1 });
    t.fire('keyup', key('KeyD'));
    expect(k.vector()).toEqual({ vx: 0, vy: -1 });
    t.fire('keydown', key('Escape'));
    picking = true;
    t.fire('keydown', key('Escape'));
    expect(esc).toBe(1);
    t.fire('blur', {});
    expect(k.vector()).toEqual({ vx: 0, vy: 0 });
    k.destroy();
    expect(t.count()).toBe(0);
  });

  it('pointer: pick first, then the social claim, then the tap rules; releases; secondary buttons only go to social', () => {
    const el = fakeEl();
    const log: string[] = [];
    let picking = false;
    let claim = false;
    const p = createPointerInput(el as never, {
      ready: () => true,
      pick: () => (picking ? (log.push('pick'), true) : false),
      worldAt: (x, y) => ({ x, y }),
      onTap: (x, y) => void log.push(`tap ${x},${y}`),
      onRelease: () => void log.push('release'),
    });
    p.setSocial({
      onTap: () => (log.push('social?'), claim),
      pointerDown: (q) => void log.push(`down b${q.button}`),
      pointerMove: () => void log.push('move'),
      pointerUp: () => void log.push('up'),
      pointerOver: () => undefined,
      pointerOut: () => undefined,
    });
    el.fire('pointerdown', ptr());
    expect(log).toEqual(['social?', 'tap 50,60', 'down b0']);
    log.length = 0;
    claim = true;
    el.fire('pointerdown', ptr());
    expect(log).toEqual(['social?', 'down b0']);
    log.length = 0;
    picking = true;
    el.fire('pointerdown', ptr());
    expect(log).toEqual(['pick', 'down b0']);
    log.length = 0;
    el.fire('pointerdown', ptr({ button: 2 }));
    expect(log).toEqual(['down b2']);
    log.length = 0;
    el.fire('pointerup', ptr({ type: 'pointerup' }));
    expect(log).toEqual(['release', 'up']);
    let menu = false;
    el.fire('contextmenu', { preventDefault: () => (menu = true) });
    expect(menu).toBe(true);
    p.destroy();
    expect(el.count()).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------ core

describe('core3d (no scene attached)', () => {
  it('wires snapshots / teleports into the state, sound cues, keys, and installs __ctCamera only when asked', () => {
    store.set('ct.debug.camera', '1');
    const conn = fakeConn();
    const b = fakeBridge(conn);
    const cues: string[] = [];
    let now = 1000;
    const el = fakeEl();
    const core = createCore3d({ bridge: b.bridge as never, layout: L, world: 'v3', tier: 'low', parent: el as never, playCue: (c) => void cues.push(c), now: () => now, keyTarget: fakeWindow as never, hour: () => 15 });
    const p = freeSpot();
    conn.events.emit('world:teleport', tp(p.x, p.y, 'outdoors', 'spawn'));
    conn.events.emit('world:snapshot', snap([ent(ME, p.x, p.y), ent(OTHER, p.x + 30, p.y)]));
    conn.events.emit('sound', { cue: 'bell' });
    expect(cues).toEqual(['bell']);
    fire('keydown', { code: 'KeyD', preventDefault: () => undefined, target: null });
    now += 16;
    let st = core.frame(0, 16);
    now += 200;
    st = core.frame(0.2, 200);
    expect(st.me).toMatchObject({ pid: ME, location: 'outdoors' });
    expect(st.me!.x).toBeGreaterThan(p.x);
    expect(st.myPid).toBe(ME);
    expect(st.hour).toBe(15);
    expect(st.tier).toBe('low');
    expect(st.remotes.get(OTHER)).toMatchObject({ x: p.x + 30, location: 'outdoors' });
    expect(st.members.get(OTHER)).toMatchObject({ name: 'Other', castId: 'fox', role: 'player' });
    expect(st.members.get(ST)).toMatchObject({ castId: 'storyteller', role: 'storyteller' });
    const hook = (globalThis.window as unknown as { __ctCamera?: Record<string, () => unknown> }).__ctCamera!;
    expect(hook).toBeTruthy();
    expect(hook.me!()).toBeNull(); // placed, but no drawn town yet: the v2 specs' `me()?.location` polls wait
    expect((hook.worldToScreen as (x: number, y: number) => unknown)(p.x, p.y)).toBeNull();
    core.attachScene(fakeScene());
    now += 16;
    st = core.frame(0.216, 16);
    expect(hook.me!()).toMatchObject({ x: st.me!.x, location: 'outdoors' });
    expect(hook.v3!()).toMatchObject({ ready: true, tier: 'low' });
    core.detachScene();
    expect(hook.me!()).toBeNull();
    expect(hook.v3!()).toMatchObject({ ready: false, tier: 'low' });
    core.setLayers([{ update: () => undefined, destroy: () => undefined, debug: () => ({ dais: () => 'd', me: () => 'clash' }) }]);
    expect((hook.dais as () => unknown)()).toBe('d');
    expect(hook.me!()).not.toBe('clash'); // a layer never replaces a core member
    core.destroy();
    expect((globalThis.window as unknown as { __ctCamera?: unknown }).__ctCamera).toBeUndefined();
    expect(b.prompts.at(-1)).toBeNull();
    expect(remoteEntities.size).toBe(0);
    expect(el.count()).toBe(0);
    expect([...winListeners.values()].reduce((n, s) => n + s.size, 0)).toBe(0); // keys + gameplay Escape gone
  });

  it('a snapshot before lobby:view (no youPid yet): our own entity is forgotten silently once we learn our pid', () => {
    const conn = fakeConn({ st: true });
    conn.lobbyView.set({ ...lobbyView({ st: true }), youPid: null });
    const b = fakeBridge(conn);
    let now = 1000;
    const core = createCore3d({ bridge: b.bridge as never, layout: L, world: 'v3', tier: 'low', parent: fakeEl() as never, playCue: () => undefined, now: () => now, keyTarget: fakeWindow as never });
    const poofs: unknown[] = [];
    core.on('poof', (e) => void poofs.push(e));
    const p = freeSpot();
    conn.events.emit('world:snapshot', snap([ent(ME, p.x, p.y), ent(OTHER, p.x + 30, p.y)]));
    now += INTERP_DELAY_MS + 16;
    core.frame(0, 16);
    expect(core.remotes.has(ME)).toBe(true); // the race: stored as a remote
    expect(remoteEntities.has(ME)).toBe(true);
    conn.lobbyView.set(lobbyView({ st: true }));
    expect(core.remotes.has(ME)).toBe(false);
    expect(core.state.remotes.has(ME)).toBe(false);
    expect(remoteEntities.has(ME)).toBe(false);
    expect(core.remotes.has(OTHER)).toBe(true);
    conn.events.emit('world:snapshot', snap([ent(ME, p.x, p.y), ent(OTHER, p.x + 30, p.y)]));
    now += 100;
    core.frame(0, 100);
    expect(poofs).toEqual([]); // no 'poof out' at our own stale position
    expect(core.state.me).toMatchObject({ pid: ME, x: p.x });
    core.destroy();
  });

  it('voteState', () => {
    expect(voteState(null)).toEqual({ voting: false, nominationOpen: false });
    expect(voteState({ day: { nominations: [{ status: 'tallied' }, { status: 'voting' }] } } as never)).toEqual({ voting: true, nominationOpen: false });
    expect(voteState({ day: { nominations: [{ status: 'pending' }] } } as never)).toEqual({ voting: false, nominationOpen: true });
    const out = { voting: true, nominationOpen: true };
    expect(voteState(null, out)).toBe(out); // filled in place (per-frame path)
    expect(out).toEqual({ voting: false, nominationOpen: false });
  });
});

describe('import boundary', () => {
  const src = (f: string) => fileURLToPath(new URL(`../../src/game3d/${f}`, import.meta.url));
  it('the pure WP1 modules reach neither phaser nor three nor @pixel3d', () => {
    for (const f of ['net/remotes.ts', 'net/local.ts', 'net/lifecycle.ts', 'input/pick.ts', 'input/tap.ts', 'input/keys.ts', 'input/pointer.ts', 'input/crosshair.ts', 'debug/hooks.ts', 'debug/frameStats.ts', 'debug/perfOverlay.ts']) {
      const c = importClosure(src(f));
      expect(c.bad, f).toEqual([]);
      expect(c.unresolved, f).toEqual([]);
    }
  });
  it('the core (and its camera) never reach phaser or @pixel3d (three is fine inside the 3D chunk)', () => {
    for (const f of ['net/core.ts', 'input/camera.ts']) {
      const c = importClosure(src(f), /^(?:phaser|@pixel3d)(?:\/|$)/);
      expect(c.bad, f).toEqual([]);
      expect(c.unresolved, f).toEqual([]);
    }
  });
});
