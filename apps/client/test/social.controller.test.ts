// v3 WP0s (v3-core). social/controller.ts is the renderer-free half of the social layer (gestures, rate
// buckets, optimistic pins, emote models and sends): it must run without Phaser (the v3 3D town draws it
// with its own surface) and keep the Classic rules (docs/v3/INTEGRATION.md §8 WP0s).
import { fileURLToPath } from 'node:url';
import { EMOTE_POINT_MS, type EmoteEvent, type LocationId, type PinView, type WorldSnapshot } from '@ct/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importClosure } from './support/importClosure';

vi.mock('phaser', () => {
  throw new Error('social/controller.ts must not load phaser');
});
vi.mock('three', () => {
  throw new Error('social/controller.ts must not load three');
});

type Listener = (e: unknown) => void;
const winListeners = new Map<string, Set<Listener>>();
const storage = new Map<string, string>();
vi.stubGlobal('window', {
  addEventListener: (t: string, fn: Listener) => void (winListeners.get(t) ?? winListeners.set(t, new Set()).get(t)!).add(fn),
  removeEventListener: (t: string, fn: Listener) => void winListeners.get(t)?.delete(fn),
  localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
  innerWidth: 1280,
  innerHeight: 720,
});
vi.stubGlobal('document', { activeElement: null });
const key = (type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) => {
  const e = { code, key: code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn(), ...extra };
  for (const fn of [...(winListeners.get(type) ?? [])]) fn(e);
  return e;
};

let now = 10_000;
vi.spyOn(performance, 'now').mockImplementation(() => now);

const { createSocialController } = await import('../src/game/social/controller');
const { socialActions, socialInfo, socialMode, socialRadial } = await import('../src/game/social/state');
const { pieMenu } = await import('../src/game/social/radial');
const { stagePick } = await import('../src/game/gameplay/pick');
const { Emitter, createStore } = await import('../src/net/store');
type SocialSurface = import('../src/game/social/controller').SocialSurface;
type SocialPointer = import('../src/game/social/controller').SocialPointer;

const ME = 'p_me';
const BOB = 'p_bob';
const CANVAS = { canvas: true } as unknown as EventTarget;

function setup(o: { st?: boolean; passTap?: boolean } = {}) {
  const events = new Emitter<{ 'world:snapshot': WorldSnapshot; 'social:emote': EmoteEvent; error: { code: string; message: string; for?: string } }>();
  const lobbyView = createStore<unknown>({ members: [{ pid: ME, displayName: 'Me' }, { pid: BOB, displayName: 'Bob' }] });
  const sent: [string, unknown][] = [];
  const conn = { events, lobbyView, send: (t: string, p: unknown) => void sent.push([t, p]) };
  const me = { x: 100, y: 100, location: 'outdoors' as LocationId, facing: 'down' as const };
  const positions = new Map<string, { x: number; y: number }>([
    [ME, { x: 100, y: 100 }],
    [BOB, { x: 200, y: 150 }],
  ]);
  const faced: [number, number][] = [];
  const taps: [number, number][] = [];
  const drawn: { id: string; view: PinView; x: number; y: number }[] = [];
  const hooks = { added: [] as string[], removed: [] as string[], nick: [] as string[], places: 0 };
  const surface: SocialSurface = {
    worldAt: (sx, sy) => ({ x: sx / 2, y: sy / 2 }), // zoom 2
    clientOf: (sx, sy) => ({ x: sx + 10, y: sy + 20 }),
    cssZoom: () => 2,
    pinAt: (wx, wy, slack) => drawn.find((d) => Math.hypot(d.x - wx, d.y - wy) <= 3 + slack) ?? null,
    isSurface: (t) => t === CANVAS,
    emoteAdded: (e) => void hooks.added.push(e.pid),
    emoteRemoved: (e) => void hooks.removed.push(e.pid),
    nickFace: (pid) => void hooks.nick.push(pid),
    placeChanged: () => void hooks.places++,
  };
  const ctl = createSocialController(
    {
      conn: conn as never,
      myPid: () => ME,
      me: () => me,
      amStoryteller: () => !!o.st,
      positionOf: (pid) => positions.get(pid) ?? null,
      entityAt: (x, y) => ([...positions].find(([, p]) => Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10)?.[0] ?? null),
      characterOf: (pid) => (pid === ME ? 'frog' : 'goat'),
      faceToward: (x, y) => void faced.push([x, y]),
      ...(o.passTap === false ? {} : { passTap: (sx: number, sy: number) => void taps.push([sx, sy]) }),
    },
    surface,
  );
  const snapshot = (pins: PinView[] = [], location: LocationId = 'outdoors') =>
    events.emit('world:snapshot', { t: 0, ackSeq: 0, entities: [{ id: ME, x: 100, y: 100, facing: 'down', moving: false, location }], pins });
  return { ctl, events, sent, me, positions, faced, taps, drawn, hooks, snapshot };
}

const mouse = (button: number, sx: number, sy: number, extra: Partial<SocialPointer> = {}): SocialPointer => ({ id: 1, button, sx, sy, wasTouch: false, event: { pointerType: 'mouse', target: CANVAS }, ...extra });
const touch = (sx: number, sy: number): SocialPointer => ({ id: 7, button: 0, sx, sy, wasTouch: true, event: { pointerType: 'touch', target: CANVAS } });

beforeEach(() => {
  now += 60_000; // fresh buckets, no ghost-click window
  socialMode.set({ mode: 'idle', color: 'gold' });
  socialRadial.set(null);
  stagePick.set(null);
  storage.clear();
});
afterEach(() => {
  pieMenu.set(null);
});

describe('social controller: import boundary', () => {
  it('controller.ts and its runtime import closure (static, re-export, side-effect, dynamic, @ct/*) never reach phaser / three / @pixel3d', () => {
    const c = importClosure(fileURLToPath(new URL('../src/game/social/controller.ts', import.meta.url)));
    expect(c.seen.length).toBeGreaterThan(3);
    expect(c.seen).toContain('packages/protocol/src/index.ts'); // @ct/* is followed
    expect(c.bad).toEqual([]);
    expect(c.unresolved).toEqual([]);
  });
});

describe('social controller: actions', () => {
  it('point at a person: faces them, sends one emote and shows it at once', () => {
    const { ctl, sent, faced, hooks, snapshot } = setup();
    snapshot();
    ctl.point(ctl.targetAt(201, 149));
    expect(sent).toEqual([['social:emote', { kind: 'point', x: 200, y: 150, pid: BOB }]]);
    expect(faced).toEqual([[200, 142]]);
    expect(hooks.added).toEqual([ME]);
    expect(ctl.emotes().get(ME)).toMatchObject({ pid: ME, x: 200, y: 150, target: BOB });
    ctl.destroy();
  });

  it('rate-limits emotes (bucket of 4)', () => {
    const { ctl, sent } = setup();
    for (let i = 0; i < 10; i++) ctl.point({ x: 1, y: 2, pid: null });
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent.length).toBeLessThanOrEqual(4);
    ctl.destroy();
  });

  it('nothing is sent before our own avatar is visible', () => {
    const { ctl, sent, positions } = setup();
    positions.delete(ME);
    ctl.point({ x: 1, y: 2, pid: null });
    ctl.pin({ x: 1, y: 2, pid: null });
    ctl.nickFace();
    expect(sent).toEqual([]);
    ctl.destroy();
  });

  it('optimistic pin: shown at once, adopted by the server pin, refused drops vanish', () => {
    const { ctl, sent, events, snapshot } = setup();
    snapshot();
    ctl.clean();
    ctl.pin({ x: 30.04, y: 40, pid: null });
    expect(sent).toEqual([['social:pin', { target: { kind: 'place', x: 30, y: 40 }, color: 'gold' }]]);
    expect(ctl.needsLayout()).toBe(true);
    let d = ctl.displayPins(now, new Set());
    expect(d.list).toHaveLength(1);
    expect(d.list[0]).toMatchObject({ local: true, view: { by: ME, character: 'frog', color: 'gold', target: { kind: 'place', x: 30, y: 40 } } });
    const localId = d.list[0]!.view.id;
    expect(localId.startsWith('~')).toBe(true);
    // the server confirms it
    const server: PinView = { id: 'pin1', by: ME, character: 'frog', color: 'gold', target: { kind: 'place', x: 30, y: 40 }, at: Date.now() };
    snapshot([server]);
    d = ctl.displayPins(now, new Set());
    expect(d.list).toEqual([{ view: server, local: false }]);
    expect([...d.adopted]).toEqual([[localId, 'pin1']]);
    ctl.publishCounts(d.list);
    expect(socialInfo.get()).toEqual({ mine: 1, here: 1 });
    // a refused drop is dropped from the optimistic list
    ctl.pin({ x: 1, y: 1, pid: null });
    expect(ctl.displayPins(now, new Set(['pin1'])).list).toHaveLength(2);
    events.emit('error', { code: 'rate_limited', message: 'x', for: 'social:pin' });
    expect(ctl.displayPins(now, new Set(['pin1'])).list).toHaveLength(1);
    ctl.destroy();
    expect(socialInfo.get()).toEqual({ mine: 0, here: 0 });
  });

  it('unpin hides at once; a server error restores it; only own pins (or the ST) are removable', () => {
    const { ctl, sent, events, snapshot } = setup();
    const mine: PinView = { id: 'a', by: ME, character: 'frog', color: 'crimson', target: { kind: 'place', x: 1, y: 1 }, at: 1 };
    const bobs: PinView = { id: 'b', by: BOB, character: 'goat', color: 'violet', target: { kind: 'person', pid: ME }, at: 2 };
    snapshot([mine, bobs]);
    expect(ctl.canRemove(mine)).toBe(true);
    expect(ctl.canRemove(bobs)).toBe(false);
    expect(ctl.hoverText(bobs)).toEqual({ text: expect.stringContaining('Bob'), removable: false });
    ctl.unpin('a');
    expect(sent.at(-1)).toEqual(['social:unpin', { id: 'a' }]);
    expect(ctl.displayPins(now, new Set()).list.map((p) => p.view.id)).toEqual(['b']);
    events.emit('error', { code: 'x', message: 'x', for: 'social:unpin' });
    expect(ctl.displayPins(now, new Set()).list.map((p) => p.view.id)).toEqual(['a', 'b']);
    ctl.unpin('~3'); // unconfirmed: nothing to send
    expect(sent.filter(([t]) => t === 'social:unpin')).toHaveLength(1);
    ctl.destroy();
  });

  it('clear all is Storyteller-only', () => {
    const p = setup();
    p.ctl.clear('all');
    expect(p.sent).toEqual([]);
    p.ctl.clear('mine');
    expect(p.sent).toEqual([['social:clearPins', { scope: 'mine' }]]);
    p.ctl.destroy();
    const s = setup({ st: true });
    s.ctl.clear('all');
    expect(s.sent).toEqual([['social:clearPins', { scope: 'all' }]]);
    s.ctl.destroy();
  });

  it('socialActions are registered while alive', () => {
    const { ctl, sent } = setup();
    socialActions.get()?.point({ x: 5, y: 5, pid: null });
    expect(sent[0]?.[0]).toBe('social:emote');
    ctl.destroy();
    expect(socialActions.get()).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe('social controller: network', () => {
  it('others’ emotes are shown, ours are not echoed; nick-face goes to the surface', () => {
    const { ctl, events, hooks } = setup();
    events.emit('social:emote', { pid: ME, kind: 'point', x: 1, y: 1, at: 0 });
    expect(hooks.added).toEqual([]);
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 3, y: 4, at: 0 });
    expect(hooks.added).toEqual([BOB]);
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 5, y: 6, at: 0 });
    expect(hooks.removed).toEqual([BOB]); // the replaced one
    expect(ctl.emotes().get(BOB)).toMatchObject({ x: 5, y: 6 });
    events.emit('social:emote', { pid: BOB, kind: 'nick-face', x: 0, y: 0, at: 0 } as EmoteEvent);
    expect(hooks.nick).toEqual([BOB]);
    ctl.dropEmote(BOB);
    expect(ctl.emotes().size).toBe(0);
    ctl.destroy();
  });

  it('a place change drops emotes and optimistic pins', () => {
    const { ctl, events, hooks, snapshot } = setup();
    snapshot();
    expect(ctl.here()).toBe(true);
    const places = hooks.places;
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 3, y: 4, at: 0 });
    ctl.pin({ x: 1, y: 1, pid: null });
    snapshot([], 'bld:tavern');
    expect(hooks.places).toBe(places + 1);
    expect(ctl.emotes().size).toBe(0);
    expect(hooks.removed).toContain(BOB);
    expect(ctl.displayPins(now, new Set()).list).toEqual([]);
    expect(ctl.here()).toBe(false); // the renderer still shows us outdoors
    expect(ctl.placeSince()).toBe(now);
    ctl.destroy();
  });

  it('tick(t) expires emotes at the end of their life (renderers never have to drop them); not while held', () => {
    const { ctl, events, hooks } = setup();
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 3, y: 4, at: 0 });
    const e = ctl.emotes().get(BOB)!;
    ctl.tick(e.t0 + EMOTE_POINT_MS - 1);
    expect(ctl.emotes().has(BOB)).toBe(true);
    ctl.debug().hold(true);
    ctl.tick(e.t0 + EMOTE_POINT_MS * 3);
    expect(ctl.emotes().has(BOB)).toBe(true); // the debug hold freezes it at half its life
    ctl.debug().hold(false);
    ctl.tick(e.t0 + EMOTE_POINT_MS);
    expect(ctl.emotes().size).toBe(0);
    expect(hooks.removed).toEqual([BOB]);
    // dropEmote while iterating the live map is safe
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 3, y: 4, at: 0 });
    events.emit('social:emote', { pid: 'p_cy', kind: 'point', x: 5, y: 6, at: 0 });
    const visited: string[] = [];
    for (const [pid] of ctl.emotes()) {
      visited.push(pid);
      ctl.dropEmote(pid);
    }
    expect(visited).toEqual([BOB, 'p_cy']);
    expect(ctl.emotes().size).toBe(0);
    ctl.destroy();
  });

  it('the debug hold freezes an emote at half its life', () => {
    const { ctl, events } = setup();
    events.emit('social:emote', { pid: BOB, kind: 'point', x: 3, y: 4, at: 0 });
    const e = ctl.emotes().get(BOB)!;
    expect(ctl.emoteAge(e, e.t0 + 99_999)).toBe(99_999);
    ctl.debug().hold(true);
    expect(ctl.emoteAge(e, e.t0 + 99_999)).toBeLessThan(99_999);
    ctl.noteSeen('x');
    ctl.noteSeen('x');
    expect(ctl.debug().seen()).toEqual(['x']);
    ctl.destroy();
  });
});

describe('social controller: input', () => {
  it('mouse tap on the town is not consumed unless in a mode; shift+click pins; taps on HUD are swallowed', () => {
    const { ctl, sent } = setup();
    expect(ctl.onTap(50, 50, mouse(0, 100, 100))).toBe(false);
    expect(ctl.onTap(50, 50, mouse(0, 100, 100, { event: { pointerType: 'mouse', target: { hud: true } as never } }))).toBe(true);
    expect(sent).toEqual([]);
    expect(ctl.onTap(50, 50, mouse(0, 100, 100, { event: { pointerType: 'mouse', shiftKey: true, target: CANVAS } }))).toBe(true);
    expect(sent.at(-1)?.[0]).toBe('social:pin');
    socialMode.set((m) => ({ ...m, mode: 'point' }));
    expect(ctl.onTap(200, 150, mouse(0, 400, 300))).toBe(true);
    expect(socialMode.get().mode).toBe('idle');
    expect(sent.at(-1)).toEqual(['social:emote', { kind: 'point', x: 200, y: 150, pid: BOB }]);
    ctl.destroy();
  });

  it('mouse click on my own drawn pin removes it', () => {
    const { ctl, sent, drawn, snapshot } = setup();
    const v: PinView = { id: 'a', by: ME, character: 'frog', color: 'crimson', target: { kind: 'place', x: 40, y: 40 }, at: 1 };
    snapshot([v]);
    drawn.push({ id: 'a', view: v, x: 40, y: 40 });
    expect(ctl.onTap(40, 41, mouse(0, 80, 82))).toBe(true);
    expect(sent).toEqual([['social:unpin', { id: 'a' }]]);
    ctl.destroy();
  });

  it('middle click pins at the world point; right click starts the pie (not in pick mode)', () => {
    const { ctl, sent } = setup();
    ctl.pointerDown(mouse(1, 60, 80));
    expect(sent).toEqual([['social:pin', { target: { kind: 'place', x: 30, y: 40 }, color: 'gold' }]]);
    stagePick.set({ label: 'x', onPick: () => undefined });
    ctl.pointerDown(mouse(1, 60, 80));
    expect(sent).toHaveLength(1);
    ctl.destroy();
  });

  it('touch tap is held until release, then replayed through passTap', () => {
    const { ctl, taps } = setup();
    expect(ctl.onTap(50, 50, touch(100, 100))).toBe(true);
    expect(ctl.pressing()).toBe(true);
    now += 120;
    expect(ctl.tick(now)).toMatchObject({ wx: 50, wy: 50 }); // the long-press ring
    ctl.pointerUp(touch(100, 100));
    expect(taps).toEqual([[100, 100]]);
    expect(ctl.pressing()).toBe(false);
    // the emulated mouse click right after a touch is swallowed
    expect(ctl.onTap(50, 50, mouse(0, 100, 100))).toBe(true);
    ctl.destroy();
  });

  it('touch long-press opens the pie at the client point instead of walking', () => {
    const { ctl, taps } = setup();
    ctl.onTap(100, 100, touch(200, 200));
    now += 500;
    expect(ctl.tick(now)).toBeNull();
    expect(pieMenu.get()).toMatchObject({ px: 210, py: 220, input: 'touch' });
    ctl.pointerUp(touch(200, 200));
    expect(taps).toEqual([]);
    ctl.destroy();
  });

  it('keys: F pins at the cursor (or where I stand), Q points; Escape cancels an armed mode', () => {
    const { ctl, sent, me } = setup();
    key('keydown', 'KeyF');
    expect(sent.at(-1)).toEqual(['social:pin', { target: { kind: 'place', x: me.x, y: me.y }, color: 'gold' }]);
    ctl.pointerMove(mouse(0, 400, 300));
    ctl.pointerOver();
    key('keydown', 'KeyQ');
    expect(sent.at(-1)).toEqual(['social:emote', { kind: 'point', x: 200, y: 150, pid: BOB }]);
    key('keyup', 'KeyQ');
    socialMode.set((m) => ({ ...m, mode: 'pin' }));
    const esc = key('keydown', 'Escape');
    expect(socialMode.get().mode).toBe('idle');
    expect(esc.stopImmediatePropagation).toHaveBeenCalled();
    const n = sent.length;
    key('keydown', 'KeyF', { ctrlKey: true }); // a shortcut, not a pin
    expect(sent).toHaveLength(n);
    ctl.destroy();
    expect(winListeners.get('keydown')?.size ?? 0).toBe(0);
  });

  it('the remembered pin colour is loaded on creation', () => {
    storage.set('ct.social.pinColor', 'teal');
    const { ctl } = setup();
    expect(socialMode.get().color).toBe('teal');
    ctl.destroy();
  });
});
