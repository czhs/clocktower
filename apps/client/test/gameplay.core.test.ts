// v3 WP0s (v3-core). gameplay/core.ts is the renderer-free half of the gameplay layer: it must run without
// Phaser (the v3 3D town uses it directly) and keep the Classic rules unchanged (docs/v3/INTEGRATION.md §8).
import { fileURLToPath } from 'node:url';
import { circleCentre, circleSpots, homeBuilding, tileCenterPx, type LocationId, type WorldSnapshot } from '@ct/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importClosure, RENDERER_SPEC, runtimeSpecifiers } from './support/importClosure';

// Loading Phaser (or three) from the core is a failure: a v3 page must not pull it in.
vi.mock('phaser', () => {
  throw new Error('gameplay/core.ts must not load phaser');
});
vi.mock('three', () => {
  throw new Error('gameplay/core.ts must not load three');
});

type Listener = (e: unknown) => void;
const winListeners = new Map<string, Set<Listener>>();
const fakeWindow = {
  addEventListener: (t: string, fn: Listener) => void (winListeners.get(t) ?? winListeners.set(t, new Set()).get(t)!).add(fn),
  removeEventListener: (t: string, fn: Listener) => void winListeners.get(t)?.delete(fn),
  localStorage: { getItem: () => null, setItem: () => undefined },
};
vi.stubGlobal('window', fakeWindow);
const fire = (type: string, e: unknown) => {
  for (const fn of [...(winListeners.get(type) ?? [])]) fn(e);
};

const { createGameplayCore } = await import('../src/game/gameplay/core');
const { gameplayState, INITIAL_GAMEPLAY_STATE } = await import('../src/game/gameplay/state');
const { stagePick } = await import('../src/game/gameplay/pick');
const { doorTagsStore } = await import('../src/game/gameplay/doorTags');
const { remoteEntities } = await import('../src/net/localPlayer');
const { Emitter, createStore } = await import('../src/net/store');
const { currentLayout } = await import('../src/net/layout');

const ME = 'p_me';
const OTHER = 'p_other';

function fakeConn() {
  const events = new Emitter<{ 'world:snapshot': WorldSnapshot }>();
  const lobbyView = createStore<unknown>({ members: [{ pid: OTHER, displayName: 'Other', cosmetics: { preset: 'frog' } }] });
  const gameView = createStore<unknown>(null);
  return { events, lobbyView, gameView };
}

function setup(o: { st?: boolean; me?: { x: number; y: number; location: LocationId } } = {}) {
  const conn = fakeConn();
  const me = { x: 0, y: 0, location: 'outdoors' as LocationId, facing: 'down' as const, ...o.me };
  const st = { v: !!o.st };
  const core = createGameplayCore({
    conn: conn as never,
    myPid: () => ME,
    me: () => me,
    amStoryteller: () => st.v,
  });
  return { conn, me, st, core };
}

const players = (n: number, dead: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ pid: i === 0 ? ME : i === 1 ? OTHER : `p${i}`, seat: i, alive: !dead.includes(i), name: `P${i}` }));

function playerView(extra: Record<string, unknown> = {}) {
  return { kind: 'player', phase: 'day', dayNumber: 1, phaseEndsAt: null, players: players(5, [3]), you: { pid: ME, seat: 0, alive: true }, gathering: false, day: { nominations: [] }, ...extra };
}

const snap = (extra: Partial<WorldSnapshot> = {}): WorldSnapshot => ({ t: 0, ackSeq: 0, entities: [{ id: ME, x: 10, y: 10, facing: 'down', moving: false, location: 'outdoors' }], ...extra });

beforeEach(() => {
  gameplayState.set(INITIAL_GAMEPLAY_STATE);
  stagePick.set(null);
  doorTagsStore.set({});
  remoteEntities.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('gameplay core: import boundary', () => {
  it('core.ts and its runtime import closure (static, re-export, side-effect, dynamic, @ct/*) never reach phaser / three / @pixel3d', () => {
    const c = importClosure(fileURLToPath(new URL('../src/game/gameplay/core.ts', import.meta.url)));
    expect(c.seen.length).toBeGreaterThan(3);
    expect(c.seen).toContain('packages/protocol/src/index.ts'); // @ct/* is followed
    expect(c.bad).toEqual([]);
    expect(c.unresolved).toEqual([]);
  });

  it('the closure scanner sees every runtime import form and skips type-only ones', () => {
    const code = [
      "import a from './a';",
      "import { b, type B } from './b';",
      "import type { C } from './c';",
      "import './side-effect';",
      "export * from './barrel';",
      "export { d } from './d';",
      "export type { E } from './e';",
      'import {',
      '  f,',
      "} from '@ct/assets';",
      "const lazy = () => import('./lazy');",
      "// import 'commented-out';",
      "export const s = 'not-a-module';",
    ].join('\n');
    expect(runtimeSpecifiers(code)).toEqual(['./a', './b', './side-effect', './barrel', './d', '@ct/assets', './lazy']);
    expect(RENDERER_SPEC.test('phaser')).toBe(true);
    expect(RENDERER_SPEC.test('three/addons/x.js')).toBe(true);
    expect(RENDERER_SPEC.test('@pixel3d/town')).toBe(true);
    expect(RENDERER_SPEC.test('threejs-free')).toBe(false);
  });
});

describe('gameplay core: door overrides + door tags', () => {
  it('reads overrides from snapshots and bumps the version only on change', () => {
    const { conn, core } = setup();
    expect(core.doorOverride('house-1')).toBeNull();
    const v0 = core.doorOverrideVersion();
    conn.events.emit('world:snapshot', snap({ doors: { 'house-1': true, tavern: false } }));
    expect(core.doorOverride('house-1')).toBe(true);
    expect(core.doorOverride('tavern')).toBe(false);
    expect(core.doorOverrideVersion()).toBe(v0 + 1);
    conn.events.emit('world:snapshot', snap({ doors: { 'house-1': true, tavern: false } }));
    expect(core.doorOverrideVersion()).toBe(v0 + 1);
    conn.events.emit('world:snapshot', snap());
    expect(core.doorOverride('house-1')).toBeNull();
    expect(core.doorOverrideVersion()).toBe(v0 + 2);
    core.destroy();
  });

  it('publishes door tags enriched with lobby data, and clears them on destroy', () => {
    const { conn, core } = setup();
    conn.events.emit('world:snapshot', snap({ doorTags: { tavern: [{ pid: OTHER, ghost: false }] } } as Partial<WorldSnapshot>));
    expect(doorTagsStore.get().tavern?.shown).toEqual([{ pid: OTHER, name: 'Other', ghost: false, preset: 'frog' }]);
    core.destroy();
    expect(doorTagsStore.get()).toEqual({});
  });
});

describe('gameplay core: server-driven avatar', () => {
  it('freezes the avatar while the server says frozen and releases afterwards', () => {
    let now = 1000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { conn, core } = setup();
    expect(core.drive()).toBeNull();
    expect(core.wantsLocalInput()).toBe(true);
    conn.events.emit('world:snapshot', snap({ you: { mode: 'frozen' } } as Partial<WorldSnapshot>));
    expect(core.drive()).toEqual({ x: 10, y: 10, facing: 'down', moving: false });
    expect(core.wantsLocalInput()).toBe(false);
    expect(core.frame().view).toBeNull();
    expect(gameplayState.get().control).toBe('frozen');
    // released: snapshots without `you`; control returns once interpolation caught up
    for (let i = 0; i < 10; i++) {
      now += 83;
      conn.events.emit('world:snapshot', snap());
      core.drive();
    }
    expect(core.drive()).toBeNull();
    expect(core.wantsLocalInput()).toBe(true);
    core.frame();
    expect(gameplayState.get().control).toBe('free');
    spy.mockRestore();
    core.destroy();
  });
});

describe('gameplay core: frame()', () => {
  it('nothing outdoors-related at night; HUD state still published', () => {
    const { conn, core } = setup();
    conn.gameView.set(playerView({ phase: 'night', gathering: true }));
    const f = core.frame();
    expect(f.markers).toEqual([]);
    expect(f.clock).toBeNull();
    expect(f.hint).toBeNull();
    expect(f.hands).toEqual([]);
    const spot = circleSpots(currentLayout(), [0, 1, 2, 3, 4]).find((s) => s.seat === 0)!;
    expect(gameplayState.get().ownSpot).toEqual({ x: spot.x, y: spot.y });
    expect(gameplayState.get().homeDoor).toEqual(tileCenterPx(currentLayout(), homeBuilding(currentLayout(), 0)!.door));
    core.destroy();
  });

  it('gathering: seat markers (own + dead), a seat hint until seated', () => {
    const { conn, core, me } = setup();
    conn.gameView.set(playerView({ gathering: true }));
    const spots = circleSpots(currentLayout(), [0, 1, 2, 3, 4]);
    const f = core.frame();
    expect(f.markers).toHaveLength(5);
    expect(f.markers.find((m) => m.seat === 0)).toMatchObject({ mine: true, dead: false });
    expect(f.markers.find((m) => m.seat === 3)).toMatchObject({ mine: false, dead: true });
    expect(f.hint).toEqual({ kind: 'seat', spot: { x: spots[0]!.x, y: spots[0]!.y } });
    expect(gameplayState.get().seated).toBe(false);
    me.x = spots[0]!.x;
    me.y = spots[0]!.y;
    const g = core.frame();
    expect(g.hint).toBeNull();
    expect(gameplayState.get().seated).toBe(true);
    // indoors: no markers, no hints
    me.location = 'bld:tavern';
    expect(core.frame().markers).toEqual([]);
    core.destroy();
  });

  it('bedtime: home-door hint with an arrow only when far', () => {
    const { conn, core, me } = setup();
    conn.gameView.set(playerView({ phase: 'bedtime' }));
    const door = tileCenterPx(currentLayout(), homeBuilding(currentLayout(), 0)!.door);
    expect(core.frame().hint).toEqual({ kind: 'home', door, arrow: true });
    me.x = door.x + 5;
    me.y = door.y;
    expect(core.frame().hint).toEqual({ kind: 'home', door, arrow: false });
    core.destroy();
  });

  it('the Storyteller gets no personal hints', () => {
    const { conn, core } = setup({ st: true });
    conn.gameView.set({ ...playerView({ gathering: true }), kind: 'storyteller' });
    const f = core.frame();
    expect(f.hint).toBeNull();
    expect(f.markers.every((m) => !m.mine)).toBe(true);
    core.destroy();
  });

  it('vote: clock targets + hands of visible voters in my location only', () => {
    const { conn, core, me } = setup({ me: { x: 50, y: 60, location: 'outdoors' } });
    const nom = { id: 'n1', nominatorSeat: 1, nomineeSeat: 2, status: 'voting', votes: { 0: true }, currentVoterSeat: 4, voteCount: 1, threshold: 3, handsRaised: [1, 2] };
    conn.gameView.set(playerView({ day: { nominations: [nom] } }));
    remoteEntities.set(OTHER, { x: 70, y: 80, location: 'outdoors' });
    remoteEntities.set('p2', { x: 1, y: 1, location: 'bld:tavern' });
    const spots = circleSpots(currentLayout(), [0, 1, 2, 3, 4]);
    const f = core.frame();
    expect(f.clock).toEqual({ centre: circleCentre(currentLayout()), voter: spots.find((s) => s.seat === 4), nominee: spots.find((s) => s.seat === 2) });
    expect(f.hands).toEqual([
      { seat: 0, pid: ME, x: 50, y: 60, locked: true },
      { seat: 1, pid: OTHER, x: 70, y: 80, locked: false },
    ]);
    // indoors: hands still shown (same location), no clock
    me.location = 'bld:tavern';
    const g = core.frame();
    expect(g.clock).toBeNull();
    expect(g.hands.map((h) => h.seat)).toEqual([0, 2]);
    core.destroy();
  });
});

describe('gameplay core: frame reuse', () => {
  it('returns the same frame object, arrays and entries each call (valid until the next frame())', () => {
    const { conn, core, me } = setup();
    conn.gameView.set(playerView({ gathering: true }));
    const f = core.frame();
    const markers = f.markers;
    const m0 = f.markers[0];
    expect(f.markers).toHaveLength(5);
    const g = core.frame();
    expect(g).toBe(f);
    expect(g.markers).toBe(markers);
    expect(g.markers[0]).toBe(m0);
    expect(g.markers).toHaveLength(5);
    me.location = 'bld:tavern';
    expect(core.frame().markers).toHaveLength(0); // reset, not appended
    me.location = 'outdoors';
    conn.gameView.set(playerView({ phase: 'night', gathering: true }));
    expect(core.frame()).toMatchObject({ markers: [], hands: [], clock: null, hint: null });
    core.destroy();
  });
});

describe('gameplay core: Storyteller pick', () => {
  it('picks at a rounded world point, holds the avatar until release; Escape cancels', () => {
    const { core, st } = setup({ st: true, me: { x: 5, y: 6, location: 'outdoors' } });
    const onPick = vi.fn();
    expect(core.pickAt(1, 2)).toBe(false);
    stagePick.set({ label: 'Walk players here', onPick });
    expect(core.isPicking()).toBe(true);
    const pf = core.frame().picking;
    expect(pf).toEqual({ label: 'Walk players here' }); // label only: no onPick handed to renderers
    expect(Object.keys(pf!)).toEqual(['label']);
    expect(core.drive()).toEqual({ x: 5, y: 6, facing: 'down', moving: false });
    expect(core.pickAt(10.6, 20.4)).toBe(true);
    expect(onPick).toHaveBeenCalledWith(11, 20);
    expect(stagePick.get()).toBeNull();
    expect(core.wantsLocalInput()).toBe(false); // the picking click is still held
    core.releasePointer();
    expect(core.wantsLocalInput()).toBe(true);
    expect(core.drive()).toBeNull();
    // Escape cancels an armed pick without calling onPick
    stagePick.set({ label: 'x', onPick });
    const e = { key: 'Escape', preventDefault: vi.fn() };
    fire('keydown', e);
    expect(stagePick.get()).toBeNull();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledTimes(1);
    // a player never picks
    st.v = false;
    stagePick.set({ label: 'x', onPick });
    expect(core.isPicking()).toBe(false);
    expect(core.pickAt(1, 1)).toBe(false);
    core.destroy();
    // destroy clears the pick, the HUD store and the Escape listener
    expect(stagePick.get()).toBeNull();
    expect(gameplayState.get()).toBe(INITIAL_GAMEPLAY_STATE);
    expect(winListeners.get('keydown')?.size ?? 0).toBe(0);
  });
});
