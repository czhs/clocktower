// v3 WP4: the overlay layer end to end over fakes (no WebGL, no real DOM): a fake document / canvas, a
// View3d that maps world px ×2 onto the screen and an AvatarRegistry over fixed positions. Checks the wiring
// that the e2e specs rely on: bubbles only over drawn avatars (text as text), labels follow the drawn set,
// door boards from doorTagsStore by day only, pins through the social controller, the transform-only DOM
// rule (a still frame writes nothing), and destroy() removing everything it added.
import { townLayout } from '@ct/assets';
import type { ChatMessage, LocationId, WorldSnapshot } from '@ct/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarRegistry, MemberLook, Pose, Scene3dState, View3d } from '../../src/game3d/contract';

vi.mock('three', () => {
  throw new Error('the overlay must not load three');
});
vi.mock('phaser', () => {
  throw new Error('the overlay must not load phaser');
});
// a decoded atlas whose every frame is a named token, so the fake 2D context can record what was blitted;
// `atlasState.noUrl` = the cropped data: URLs are not there yet (the atlas is still decoding)
const atlasState = vi.hoisted(() => ({ noUrl: false }));
vi.mock('../../src/game3d/overlay/atlas', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/game3d/overlay/atlas')>();
  return {
    ...orig,
    createAtlas: () => {
      const cache = new Map<string, unknown>();
      return {
        frame: (sheet: string, name: string, night = false) => {
          const k = `${sheet}|${name}|${night}`;
          if (!cache.has(k)) cache.set(k, { img: { name }, x: 0, y: 0, w: 8, h: 8 });
          return cache.get(k);
        },
        url: (_sheet: string, name: string, night = false) => (atlasState.noUrl ? null : `data:image/png;base64,${name}${night ? '-night' : ''}`),
        meta: () => null,
        tokens: () => orig.FALLBACK_TOKENS,
        ready: () => true,
        onChange: () => () => undefined,
        destroy: () => undefined,
      };
    },
  };
});

// ---------------------------------------------------------------------------------------- fake DOM
type Listener = (e: unknown) => void;
const created: string[] = [];
let drawCalls = 0;
/** Names of the atlas frames drawn on the FX canvas (cleared by the tests). */
const blits: string[] = [];
let measureCalls = 0;
let lastDraw: number[] = [];
/** The overlay frame number (bumped by setup's frame()): every style write is logged with it. */
let frameId = 0;
/** getBoundingClientRect reads of text spans (the layout reads of label / bubble measuring). */
let rectReads = 0;
/** The town is hidden (display:none): text measures 0 × 0. */
let hiddenTown = false;
/** A Text node: textContent only (the bubble's message); writes are counted. */
class FakeText {
  parent: FakeEl | null = null;
  writes = 0;
  private t = '';
  get textContent() {
    return this.t;
  }
  set textContent(v: string) {
    this.t = v;
    this.writes++;
  }
  readonly tagName = '#text';
  readonly className = '';
  all(): FakeEl[] {
    return [];
  }
  contains(n: unknown): boolean {
    return n === this;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this as unknown as FakeEl), 1);
    this.parent = null;
  }
}
class FakeEl {
  /** Every CSSOM style write: property, value, overlay frame. */
  log: { prop: string; value: string; frame: number }[] = [];
  style: Record<string, string> = new Proxy({} as Record<string, string>, {
    set: (o, k, v) => {
      o[k as string] = v as string;
      this.log.push({ prop: String(k), value: v as string, frame: frameId });
      return true;
    },
  });
  textWrites = 0;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = '';
  width = 0;
  height = 0;
  private text = '';
  private listeners = new Map<string, Set<Listener>>();
  constructor(
    readonly tagName: string,
    readonly ownerDocument: unknown,
  ) {}
  get textContent() {
    return this.text;
  }
  set textContent(v: string) {
    this.text = v;
    this.textWrites++;
  }
  get offsetWidth() {
    return Math.max(1, ...this.text.split('\n').map((l) => l.length)) * 7;
  }
  get offsetHeight() {
    return this.text.split('\n').length * 14;
  }
  appendChild<T extends FakeEl | FakeText>(c: T): T {
    c.remove(); // DOM semantics: appending an existing child moves it to the end
    c.parent = this;
    this.children.push(c as FakeEl);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  toDataURL() {
    return 'data:image/png;base64,CROP';
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  contains(n: unknown): boolean {
    return n === this || this.children.some((c) => c.contains(n));
  }
  getBoundingClientRect() {
    if (this.tagName === 'span') {
      // a text span: its text size (fractional, as a browser reports it), 0 × 0 while the town is hidden
      rectReads++;
      const w = hiddenTown ? 0 : this.offsetWidth + 0.4;
      const h = hiddenTown ? 0 : this.offsetHeight;
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
    }
    return { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540 };
  }
  addEventListener(t: string, fn: Listener) {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(fn);
  }
  removeEventListener(t: string, fn: Listener) {
    this.listeners.get(t)?.delete(fn);
  }
  dispatch(t: string, e: unknown) {
    for (const fn of this.listeners.get(t) ?? []) fn(e);
  }
  getContext() {
    const noop = () => undefined;
    return {
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      clearRect: noop,
      fillRect: () => void drawCalls++,
      drawImage: (img: { name?: string }, ...args: number[]) => {
        drawCalls++;
        lastDraw = args;
        if (img?.name) blits.push(img.name);
      },
      save: noop,
      restore: noop,
      beginPath: noop,
      arc: noop,
      rect: noop,
      clip: noop,
      measureText: (s: string) => {
        measureCalls++;
        return { width: s.length * 7 };
      },
    };
  }
  all(): FakeEl[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}
const winListeners = new Map<string, Set<Listener>>();
const fakeWindow = {
  addEventListener: (t: string, fn: Listener) => void (winListeners.get(t) ?? winListeners.set(t, new Set()).get(t)!).add(fn),
  removeEventListener: (t: string, fn: Listener) => void winListeners.get(t)?.delete(fn),
  localStorage: { getItem: (k: string) => (k === 'ct.debug.social' ? '1' : null), setItem: () => undefined },
  innerWidth: 960,
  innerHeight: 540,
};
const fontListeners = new Set<Listener>();
const doc = {
  fonts: {
    addEventListener: (t: string, fn: Listener) => void (t === 'loadingdone' && fontListeners.add(fn)),
    removeEventListener: (t: string, fn: Listener) => void (t === 'loadingdone' && fontListeners.delete(fn)),
  },
  createElement: (tag: string) => {
    created.push(tag);
    return new FakeEl(tag, doc);
  },
  createTextNode: (t: string) => {
    const n = new FakeText();
    n.textContent = t;
    return n;
  },
  defaultView: fakeWindow,
  activeElement: null,
};
vi.stubGlobal('window', fakeWindow);
vi.stubGlobal('document', doc);
vi.stubGlobal('Node', FakeEl);
let now = 50_000;
vi.spyOn(performance, 'now').mockImplementation(() => now);

const { createOverlayLayer } = await import('../../src/game3d/overlay/index');
const { doorTagsStore } = await import('../../src/game/gameplay/doorTags');
const { socialInfo, socialMode } = await import('../../src/game/social/state');
const { Emitter, createStore } = await import('../../src/net/store');
const { voicePresence } = await import('../../src/voice/VoiceClient');
const { createSurface } = await import('../../src/game3d/overlay/surface');
const { newStats } = await import('../../src/game3d/overlay/place');

// ---------------------------------------------------------------------------------------- fixtures
const ME = 'p_me';
const BOB = 'p_bob';
const HIDDEN = 'p_hidden';
const positions = new Map<string, { x: number; y: number }>([
  [ME, { x: 200, y: 200 }],
  [BOB, { x: 260, y: 210 }],
]);
const view: View3d = {
  worldToScreen: (p, loc, h = 0) => (loc === 'outdoors' ? { x: p.x * 2, y: p.y * 2 - h * 32 } : null),
  screenToWorld: (x, y) => ({ x: x / 2, y: y / 2, location: 'outdoors' as LocationId }),
  cssPerPx: () => 2,
};
const avatars: AvatarRegistry = {
  anchorOf: (pid) => {
    const p = positions.get(pid);
    return p ? { feet: p, displayFeet: p, headTopCss: { x: p.x * 2, y: p.y * 2 - 1.2 * 32 }, heightM: 1.2 } : null;
  },
  pidAt: (x, y) => [...positions].find(([, p]) => Math.abs(p.x * 2 - x) < 16 && y < p.y * 2 + 4 && y > p.y * 2 - 48)?.[0] ?? null,
  debug: () => null,
};

/** A View3d like WP1's camera: worldToScreen clips to the 960×540 canvas, project() does not. */
const clipView = {
  worldToScreen: (p: { x: number; y: number }, loc: LocationId, h = 0) => {
    const s = loc === 'outdoors' ? { x: p.x * 2, y: p.y * 2 - h * 32 } : null;
    return s && s.x >= 0 && s.y >= 0 && s.x <= 960 && s.y <= 540 ? s : null;
  },
  project: (p: { x: number; y: number }, _loc: LocationId, h = 0) => ({ x: p.x * 2, y: p.y * 2 - h * 32 }),
  screenToWorld: view.screenToWorld,
  cssPerPx: () => 2,
};
/** An AvatarRegistry like WP2's: anchorOf is null while the head is off the canvas. */
const clipAvatars: AvatarRegistry = {
  ...avatars,
  anchorOf: (pid) => {
    const a = avatars.anchorOf(pid);
    return a && clipView.worldToScreen(a.feet, 'outdoors', a.heightM) ? a : null;
  },
};

interface SetupOpts {
  view?: View3d;
  avatars?: AvatarRegistry;
  gameplay?: () => unknown;
  avatarShown?: (pid: string) => boolean;
}

function setup(opts: SetupOpts = {}) {
  created.length = 0;
  const events = new Emitter<{ 'chat:message': ChatMessage; 'world:snapshot': WorldSnapshot; 'world:teleport': unknown; 'social:emote': unknown; error: unknown }>();
  const lobbyView = createStore<unknown>({ youPid: ME, members: [{ pid: ME, displayName: 'Me', role: 'player', seat: null }, { pid: BOB, displayName: 'Bob', role: 'player', seat: null }] });
  const gameView = createStore<unknown>(null);
  const sent: [string, unknown][] = [];
  const conn = { events, lobbyView, gameView, send: (t: string, p: unknown) => void sent.push([t, p]) };
  const parent = new FakeEl('div', doc);
  const canvas = parent.appendChild(new FakeEl('canvas', doc));
  const layer = createOverlayLayer({
    parent: parent as unknown as HTMLElement,
    surface: parent as unknown as HTMLElement,
    conn: conn as never,
    view: opts.view ?? view,
    avatars: opts.avatars ?? avatars,
    pixelScale: () => 2,
    ...(opts.gameplay ? { gameplay: opts.gameplay as never } : {}),
    ...(opts.avatarShown ? { avatarShown: opts.avatarShown } : {}),
  });
  const members = new Map<string, MemberLook>([
    [ME, { name: 'Me', castId: 'frog', seat: null, role: 'player' }],
    [BOB, { name: 'Bob', castId: 'fox', seat: null, role: 'player' }],
    [HIDDEN, { name: 'Hidden', castId: 'owl', seat: null, role: 'player' }],
  ]);
  const remotes = new Map<string, Pose>([[BOB, { pid: BOB, x: 260, y: 210, location: 'outdoors', facing: 'down', moving: false }]]);
  const state: Scene3dState = {
    me: { pid: ME, x: 200, y: 200, location: 'outdoors', facing: 'down', moving: false },
    myPid: ME,
    amStoryteller: false,
    remotes,
    members,
    game: null,
    phase: 'waiting',
    layout: townLayout,
    world: 'v2',
    tier: 'high',
    reducedMotion: false,
    hour: 12,
  };
  const frame = () => {
    frameId++;
    layer.update(state, now / 1000, 1 / 60);
    layer.flush();
  };
  const hook = layer.debug!();
  return { layer, events, conn, sent, parent, canvas, state, remotes, frame, hook };
}

const chat = (fromPid: string, text: string, id = Math.random().toString(36).slice(2)): ChatMessage => ({ id, fromPid, fromName: fromPid, text, scope: 'zone', at: undefined as unknown as number });

beforeEach(() => {
  now += 10_000;
  blits.length = 0;
  positions.set(ME, { x: 200, y: 200 });
  positions.set(BOB, { x: 260, y: 210 });
  voicePresence.set({ speaking: [], selfPid: null, selfMuted: false, selfTransmitting: false, heardBy: [] });
  doorTagsStore.set({});
  socialMode.set({ mode: 'idle', color: 'gold' });
  atlasState.noUrl = false;
  hiddenTown = false;
  warnSpy.mockClear();
});
// index.ts catches a throwing view (one broken view must not blank the town): make such a throw fail the test
const warnSpy = vi.spyOn(console, 'warn');
afterEach(() => {
  const failed = warnSpy.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].startsWith('[town3d] overlay view'));
  expect(failed.map((c) => String(c[1]))).toEqual([]);
});

describe('overlay layer', () => {
  it('adds one root with an FX canvas, and a label per drawn avatar', () => {
    const t = setup();
    t.frame();
    const root = t.parent.children.find((c) => c.className === 'ct-v3-overlay')!;
    expect(root).toBeTruthy();
    expect(root.style.pointerEvents).toBe('none');
    const labels = root.all().filter((e) => e.className === 'ct-v3-label');
    expect(labels.map((l) => l.textContent).sort()).toEqual(['Bob', 'Me']);
    // a remote leaving the drawn set loses its label
    t.remotes.delete(BOB);
    t.frame();
    expect(root.all().filter((e) => e.className === 'ct-v3-label').map((l) => l.textContent)).toEqual(['Me']);
    t.layer.destroy();
    expect(t.parent.children.includes(root)).toBe(false);
  });

  it('bubbles only over drawn avatars, text kept as text, replaced per speaker, gone after expiry', () => {
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'Hello there'));
    t.events.emit('chat:message', chat(HIDDEN, 'psst')); // not drawn: chat panel only
    t.frame();
    const shown = () => (t.hook.bubbles!() as { pid: string; text: string; box: { x: number; y: number; width: number; height: number } }[]);
    expect(shown().map((b) => [b.pid, b.text])).toEqual([[BOB, 'Hello there']]);
    // above the speaker's head top (page px: head at y = 210*2 - 38.4)
    const b = shown()[0]!;
    expect(b.box.y + b.box.height).toBeLessThan(210 * 2 - 38.4);
    expect(b.box.width).toBeGreaterThan(0);
    const evil = '<img src=x onerror=alert(1)> hi';
    t.events.emit('chat:message', chat(BOB, evil));
    t.frame();
    expect(shown().map((x) => x.text.replace(/\s+/g, ' '))).toEqual([evil]); // wrapped lines, same text
    expect(created).not.toContain('img');
    now += 8000; // > SPEECH.maxMs
    t.frame();
    expect(shown()).toEqual([]);
    t.layer.destroy();
  });

  it('a still frame writes no transform (the §7 rule), a move writes', () => {
    const t = setup();
    t.events.emit('chat:message', chat(ME, 'standing still'));
    t.frame();
    t.frame();
    const ov = () => t.hook.overlay!() as { transforms: number };
    const before = ov().transforms;
    t.frame();
    t.frame();
    expect(ov().transforms).toBe(before);
    positions.set(BOB, { x: 262, y: 210 });
    t.frame();
    expect(ov().transforms).toBeGreaterThan(before);
    positions.set(BOB, { x: 260, y: 210 });
    t.layer.destroy();
  });

  it('door boards come from doorTagsStore by day, for lived-in houses, and vanish at night', () => {
    const t = setup();
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    const tags = [
      { pid: 'a', name: 'Ada', ghost: false, preset: 'frog' },
      { pid: 'b', name: 'Bram', ghost: true, preset: 'fox' },
      { pid: 'c', name: 'Cy', ghost: false, preset: null },
      { pid: 'd', name: 'Dee', ghost: false, preset: 'owl' },
      { pid: 'e', name: 'Eve', ghost: false, preset: 'crow' },
    ];
    doorTagsStore.set({ [house.id]: { tags, shown: tags.slice(0, 4), overflow: 1 } });
    t.frame();
    const boards = t.hook.doorBoards!() as Record<string, { tokens: string[]; badge: string | null; visible: boolean; screen: unknown }>;
    expect(boards[house.id]).toMatchObject({ tokens: ['Ada', 'Bram (ghost)', 'Cy', 'Dee'], badge: '+1', visible: true });
    t.state.phase = 'night';
    t.frame();
    expect(t.hook.doorBoards!()).toEqual({});
    t.layer.destroy();
  });

  it('pins from the snapshot reach the dock counters; an armed pin tap is consumed and sent', () => {
    const t = setup();
    t.frame();
    const snap = {
      t: 1,
      ackSeq: 0,
      entities: [{ id: ME, x: 200, y: 200, location: 'outdoors', facing: 'down', moving: false }],
      pins: [{ id: 'pin1', by: BOB, character: 'fox', color: 'teal', target: { kind: 'place', x: 230, y: 230 }, at: 1 }],
    } as unknown as WorldSnapshot;
    t.events.emit('world:snapshot', snap);
    t.frame();
    expect(socialInfo.get()).toEqual({ mine: 0, here: 1 });
    const pins = () => ((globalThis as unknown as { window: { __ctSocial?: { pins(): { id: string; visible: boolean; x: number; y: number }[] } } }).window.__ctSocial!.pins());
    expect(pins()).toMatchObject([{ id: 'pin1', visible: true, x: 460, y: 460 }]);
    // dock "pin" mode: the next primary tap drops a pin there (WP1 asks the sink first)
    socialMode.set({ mode: 'pin', color: 'gold' });
    const ev = { pointerId: 1, button: 0, clientX: 300, clientY: 300, pointerType: 'mouse', shiftKey: false, target: t.canvas, preventDefault: () => undefined };
    expect(t.layer.socialSink!.onTap(150, 150, { id: 1, button: 0, sx: 300, sy: 300, wasTouch: false, event: ev as never })).toBe(true);
    expect(t.sent.find(([k]) => k === 'social:pin')?.[1]).toMatchObject({ target: { kind: 'place', x: 150, y: 150 }, color: 'gold' });
    t.layer.destroy();
    expect((globalThis as unknown as { window: { __ctSocial?: unknown } }).window.__ctSocial).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------- fix round (review 1)
type Shown = { pid: string; text: string }[];
const transformOf = (e: FakeEl) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(e.style.transform ?? '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const rootOf = (t: { parent: FakeEl }) => t.parent.children.find((c) => c.className === 'ct-v3-overlay')!;

describe('overlay: drawn vs on screen', () => {
  it('a bubble survives its speaker\'s head going off the canvas and comes back (fallback: seen in this place)', () => {
    const t = setup({ view: clipView as View3d, avatars: clipAvatars });
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'hold on'));
    t.frame();
    const shown = () => t.hook.bubbles!() as Shown;
    expect(shown().map((b) => b.text)).toEqual(['hold on']);
    // Bob's head leaves the canvas for a frame (the camera pans): nothing drawn, nothing lost
    positions.set(BOB, { x: 600, y: 210 });
    now += 16;
    t.frame();
    expect(shown()).toEqual([]);
    const bubbleEls = () => rootOf(t).all().filter((e) => e.className === 'ct-v3-bubble');
    expect(bubbleEls().every((e) => e.style.visibility === 'hidden')).toBe(true);
    // a new line while he is off screen is accepted (he is still drawn in our place)
    t.events.emit('chat:message', chat(BOB, 'still here'));
    positions.set(BOB, { x: 260, y: 210 });
    now += 16;
    t.frame();
    expect(shown().map((b) => [b.pid, b.text])).toEqual([[BOB, 'still here']]);
    expect(bubbleEls().some((e) => e.style.visibility === 'visible')).toBe(true);
    // leaving the place does drop it
    t.remotes.set(BOB, { ...t.remotes.get(BOB)!, location: 'house-1' as LocationId });
    t.frame();
    t.remotes.set(BOB, { ...t.remotes.get(BOB)!, location: 'outdoors' });
    t.frame();
    expect(shown()).toEqual([]);
    t.layer.destroy();
  });

  it('with the registry\'s shown flag, a never-projected same-place speaker still keeps a bubble', () => {
    const t = setup({ view: clipView as View3d, avatars: clipAvatars, avatarShown: (pid) => pid === ME || pid === BOB });
    positions.set(BOB, { x: 600, y: 210 }); // off screen from the start
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'from afar'));
    t.frame();
    expect(t.hook.bubbles!()).toEqual([]);
    positions.set(BOB, { x: 260, y: 210 });
    t.frame();
    expect((t.hook.bubbles!() as Shown).map((b) => b.text)).toEqual(['from afar']);
    t.layer.destroy();
  });
});

// a GameplayFrame-shaped object (only the fields the overlay reads)
const gfOf = (over: Record<string, unknown> = {}) => ({ view: null, me: { x: 200, y: 200, location: 'outdoors', facing: 'down' }, picking: null, hands: [], markers: [], clock: null, hint: null, ...over });

describe('overlay: gameplay view', () => {
  it('hint arrow on screen, edge marker for an off-screen target (unclipped projection)', () => {
    let gf = gfOf({ hint: { kind: 'seat', spot: { x: 300, y: 200 } } });
    const t = setup({ view: clipView as View3d, avatars: clipAvatars, gameplay: () => gf });
    t.frame();
    expect(blits.some((n) => n.startsWith('guide_'))).toBe(true);
    expect(blits.some((n) => n.startsWith('offscreen_'))).toBe(false);
    blits.length = 0;
    gf = gfOf({ hint: { kind: 'seat', spot: { x: 2000, y: 200 } } }); // screen x 4000: far right, off the canvas
    t.frame();
    expect(blits).toContain('offscreen_right');
    expect(blits.some((n) => n.startsWith('guide_'))).toBe(false);
    blits.length = 0;
    gf = gfOf({ hint: { kind: 'seat', spot: { x: 200, y: -900 } } }); // straight up
    t.frame();
    expect(blits).toContain('offscreen_up');
    t.layer.destroy();
  });

  it('seat markers: own spot pulses with the chevron, dead wisps, plain stones', () => {
    const gf = gfOf({
      markers: [
        { seat: 0, x: 210, y: 200, mine: true, dead: false },
        { seat: 1, x: 230, y: 200, mine: false, dead: true },
        { seat: 2, x: 250, y: 200, mine: false, dead: false },
      ],
    });
    const t = setup({ gameplay: () => gf });
    t.frame();
    expect(blits.some((n) => /^seat_you_[0-3]$/.test(n))).toBe(true);
    expect(blits.some((n) => /^you_seat_[01]$/.test(n))).toBe(true);
    expect(blits.some((n) => /^seat_dead_[01]$/.test(n))).toBe(true);
    expect(blits).toContain('seat_stone');
    t.layer.destroy();
  });

  it('hands: raised / locked over drawn voters, ghost frames for the dead, nothing for an off-screen voter', () => {
    const players = [
      { pid: ME, seat: 0, alive: true },
      { pid: BOB, seat: 1, alive: false },
    ];
    let gf = gfOf({
      view: { players },
      hands: [
        { seat: 0, pid: ME, x: 200, y: 200, locked: true },
        { seat: 1, pid: BOB, x: 260, y: 210, locked: false },
      ],
    });
    const t = setup({ view: clipView as View3d, avatars: clipAvatars, gameplay: () => gf });
    t.frame();
    expect(blits).toContain('hand_locked');
    expect(blits).toContain('hand_ghost');
    blits.length = 0;
    gf = gfOf({ view: { players: [{ pid: BOB, seat: 1, alive: true }] }, hands: [{ seat: 1, pid: BOB, x: 260, y: 210, locked: false }] });
    t.frame();
    expect(blits.some((n) => /^hand_raised_[01]$/.test(n))).toBe(true);
    blits.length = 0;
    positions.set(BOB, { x: 600, y: 210 }); // drawn, but the head is off the canvas
    gf = gfOf({ view: { players: [{ pid: BOB, seat: 1, alive: true }] }, hands: [{ seat: 1, pid: BOB, x: 600, y: 210, locked: false }] });
    t.frame();
    expect(blits.some((n) => n.startsWith('hand_'))).toBe(false);
    t.layer.destroy();
  });

  it('home hint: ring + chevron on the door', () => {
    const gf = gfOf({ hint: { kind: 'home', door: { x: 230, y: 230 }, arrow: true } });
    const t = setup({ gameplay: () => gf });
    t.frame();
    expect(blits.some((n) => /^door_ring_[0-3]$/.test(n))).toBe(true);
    expect(blits).toContain('door_chevron');
    expect(blits.some((n) => n.startsWith('guide_'))).toBe(true);
    t.layer.destroy();
  });

  it('poofs: own teleport (both ends), not on a correction; a remote jump > 48 px', () => {
    const t = setup();
    const poofs = () => (t.hook.overlay!() as { poofs: number }).poofs;
    t.frame();
    t.events.emit('world:teleport', { x: 150, y: 150, location: 'outdoors', reason: 'correction' });
    t.state.me = { ...t.state.me!, x: 150, y: 150 };
    t.frame();
    expect(poofs()).toBe(0);
    t.events.emit('world:teleport', { x: 230, y: 180, location: 'outdoors', reason: 'storyteller' });
    t.frame();
    expect(poofs()).toBe(2);
    expect(blits.some((n) => /^poof_[0-5]$/.test(n))).toBe(true);
    now += 1000; // poofs last 6 / 15 s
    t.frame();
    expect(poofs()).toBe(0);
    t.remotes.set(BOB, { ...t.remotes.get(BOB)!, x: 262 }); // a step: no poof
    t.frame();
    expect(poofs()).toBe(0);
    t.remotes.set(BOB, { ...t.remotes.get(BOB)!, x: 400 }); // a jump
    t.frame();
    expect(poofs()).toBe(2);
    t.layer.destroy();
  });
});

describe('overlay: talking, house names, board tooltip, DOM counters', () => {
  it('talk glyph + ground ripple for a heard speaker; own idle glyph while transmitting', () => {
    const t = setup();
    voicePresence.set({ speaking: [BOB], selfPid: ME, selfMuted: false, selfTransmitting: true, heardBy: [] });
    t.frame();
    expect(blits.some((n) => /^talk_[0-3]$/.test(n))).toBe(true);
    expect(blits.some((n) => /^talk_ring_[0-2]$/.test(n))).toBe(true);
    expect(blits).toContain('talk_self_idle');
    expect((t.hook.overlay!() as { talking: string[] }).talking.sort()).toEqual([BOB, ME].sort());
    blits.length = 0;
    voicePresence.set({ speaking: [], selfPid: ME, selfMuted: false, selfTransmitting: false, heardBy: [] });
    t.frame();
    expect(blits.some((n) => n.startsWith('talk'))).toBe(false);
    t.layer.destroy();
  });

  it('house names: one callout per lived-in house, fitted once (not per frame), kept off the door board', () => {
    const house = townLayout.buildings.find((b) => b.kind === 'house' && typeof b.houseIndex === 'number')!;
    const seat = house.houseIndex!;
    const t = setup();
    t.conn.lobbyView.set({ youPid: ME, members: [{ pid: ME, displayName: 'Me', role: 'player', seat }, { pid: BOB, displayName: 'Bob', role: 'player', seat: null }] });
    t.frame();
    const callouts = () => rootOf(t).all().filter((e) => e.className === 'ct-v3-callout');
    expect(callouts().map((c) => c.textContent)).toEqual(['Me']);
    const m0 = measureCalls;
    const c0 = (t.hook.overlay!() as { content: number }).content;
    for (let i = 0; i < 5; i++) t.frame();
    expect(measureCalls).toBe(m0); // cached: no measureText / font parse per frame
    expect((t.hook.overlay!() as { content: number }).content).toBe(c0);
    // a new lobby payload (e.g. a rename) rebuilds
    t.conn.lobbyView.set({ youPid: ME, members: [{ pid: ME, displayName: 'Mabel', role: 'player', seat }] });
    t.frame();
    expect(callouts().map((c) => c.textContent)).toEqual(['Mabel']);
    // with a door board on the same house the callout never overlaps it
    const tags = [{ pid: 'a', name: 'Ada', ghost: false, preset: 'frog' }];
    doorTagsStore.set({ [house.id]: { tags, shown: tags, overflow: 0 } });
    t.frame();
    const board = (t.hook.doorBoards!() as Record<string, { screen: { x: number; y: number; w: number; h: number } | null }>)[house.id]!.screen!;
    const c = callouts()[0]!;
    const p = transformOf(c)!;
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    const overlap = p.x < board.x + board.w && p.x + w > board.x && p.y < board.y + board.h && p.y + h > board.y;
    expect(overlap).toBe(false);
    t.layer.destroy();
  });

  it('board tooltip: hovering a token shows its name, leaving hides it', () => {
    const t = setup();
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    const tags = [{ pid: 'a', name: 'Ada', ghost: false, preset: 'frog' }];
    doorTagsStore.set({ [house.id]: { tags, shown: tags, overflow: 0 } });
    t.frame();
    const box = (t.hook.doorBoards!() as Record<string, { screen: { x: number; y: number; w: number; h: number } }>)[house.id]!.screen;
    const tips = () => rootOf(t).all().filter((e) => e.className === 'ct-v3-tip' && e.style.visibility === 'visible');
    t.parent.dispatch('pointermove', { pointerType: 'mouse', clientX: box.x + box.w / 2, clientY: box.y + box.h / 2 });
    t.frame();
    expect(tips().map((e) => e.textContent)).toEqual(['Ada']);
    t.parent.dispatch('pointermove', { pointerType: 'mouse', clientX: 5, clientY: 5 });
    t.frame();
    expect(tips()).toEqual([]);
    t.layer.destroy();
  });

  it('standing still: no DOM writes at all (positions, styles, text) between frames', () => {
    const t = setup();
    t.events.emit('chat:message', chat(BOB, 'hi'));
    const tags = [{ pid: 'a', name: 'Ada', ghost: false, preset: 'frog' }];
    doorTagsStore.set({ [townLayout.buildings.find((b) => b.kind === 'house')!.id]: { tags, shown: tags, overflow: 0 } });
    t.frame();
    t.frame();
    const ov = () => t.hook.overlay!() as { transforms: number; visibility: number; content: number };
    const a = { ...ov() };
    for (let i = 0; i < 5; i++) {
      now += 16;
      t.frame();
    }
    const b = ov();
    expect([b.transforms, b.visibility, b.content]).toEqual([a.transforms, a.visibility, a.content]);
    t.layer.destroy();
  });
});

describe('overlay: FX canvas grid', () => {
  it('draws at CSS-px resolution: sprites scaled by px, anchored at the whole CSS px of the point (≤ 0.5 px off)', () => {
    const parent = new FakeEl('div', doc);
    const surf = createSurface(parent as unknown as HTMLElement, newStats());
    const canvas = parent.children[0]!.children.find((c) => c.tagName === 'canvas')!;
    surf.fx.begin(4, 961.5, 540);
    expect([canvas.width, canvas.height]).toEqual([962, 540]);
    expect(canvas.style.width).toBe('962px');
    const fr = { img: {} as CanvasImageSource, x: 10, y: 20, w: 9, h: 5 };
    surf.fx.blit(fr, 101.4, 50.6, 2, 1);
    // source rect, then dest: round(x) - ax·px, round(y) - ay·px, w·px, h·px
    expect(lastDraw).toEqual([10, 20, 9, 5, 101 - 8, 51 - 4, 36, 20]);
    surf.fx.blit(fr, 103.6, 50.4, 2, 1); // 1 texel = 4 CSS px, but the sprite still moves by whole CSS px
    expect(lastDraw.slice(4, 6)).toEqual([104 - 8, 50 - 4]);
    surf.destroy();
  });
});

// ---------------------------------------------------------------------------------------- D2: DOM bubbles
/**
 * CSS paint order of two absolutely positioned elements that are children of the same stacking context
 * (the overlay root: `isolation: isolate`): the higher z-index paints later; equal z-indices paint in tree
 * order. Fails loudly if either is not such a child (then this comparison would not be the browser's).
 */
function paintsAbove(root: FakeEl, a: FakeEl, b: FakeEl): boolean {
  for (const e of [a, b]) {
    expect(e.parent).toBe(root);
    expect(e.style.position).toBe('absolute');
    expect(e.style.zIndex).toMatch(/^\d+$/);
  }
  expect(root.style.isolation).toBe('isolate');
  const za = Number(a.style.zIndex);
  const zb = Number(b.style.zIndex);
  if (za !== zb) return za > zb;
  return root.children.indexOf(a) > root.children.indexOf(b);
}
const boxOfEl = (e: FakeEl) => {
  const p = transformOf(e)!;
  const w = e.style.width ? parseFloat(e.style.width) : e.offsetWidth;
  const h = e.style.height ? parseFloat(e.style.height) : e.offsetHeight;
  return { x: p.x, y: p.y, w, h };
};
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('overlay: chat bubbles are DOM elements above the name labels (D2)', () => {
  const CAROL = 'p_carol';

  it('one element per bubble: border-image 9-slice from bubble_nine, tail child, text as a text node', () => {
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'Hello there'));
    t.frame();
    const els = rootOf(t).all().filter((e) => e.className === 'ct-v3-bubble');
    expect(els).toHaveLength(1);
    const el = els[0]!;
    expect(el.style.visibility).toBe('visible');
    expect(el.style.borderImageSource).toBe('url("data:image/png;base64,bubble_nine")');
    expect(el.style.borderImageSlice).toBe('3 3 4 3 fill');
    expect(el.style.borderWidth).toBe('6px 6px 8px 6px'); // texels × px 2
    // the text is the element's own text node (never parsed as markup)
    const text = el.children.find((c) => c.tagName === '#text')!;
    expect(text.textContent).toBe('Hello there');
    const tail = el.children.find((c) => c.className === 'ct-v3-bubble-tail')!;
    expect(tail.attrs['aria-hidden']).toBe('true');
    expect(tail.style.backgroundImage).toBe('url("data:image/png;base64,bubble_tail")');
    expect(tail.style.display).toBe('');
    // the debug shape (v2) matches the element: page box = transform + explicit size
    const shown = t.hook.bubbles!() as { box: { x: number; y: number; width: number; height: number } }[];
    const bx = boxOfEl(el);
    expect(shown[0]!.box).toEqual({ x: bx.x, y: bx.y, width: bx.w, height: bx.h });
    // nothing of the bubble is drawn on the FX canvas any more
    expect(blits.some((n) => n.startsWith('bubble_'))).toBe(false);
    // night swaps the art in place (no new element)
    t.state.hour = 23;
    t.frame();
    expect(el.style.borderImageSource).toBe('url("data:image/png;base64,bubble_nine-night")');
    expect(rootOf(t).all().filter((e) => e.className === 'ct-v3-bubble')).toHaveLength(1);
    t.layer.destroy();
  });

  it('a bubble element paints above every label, including a label created after it that it covers', () => {
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'Over your name'));
    t.events.emit('chat:message', chat(ME, 'me too'));
    t.frame();
    // Carol arrives AFTER the bubbles exist (her label is created later in tree order), standing so that her
    // name label lies inside Bob's bubble box
    positions.set(CAROL, { x: 260, y: 197 });
    (t.state.members as Map<string, MemberLook>).set(CAROL, { name: 'Carol', castId: 'owl', seat: null, role: 'player' });
    t.remotes.set(CAROL, { pid: CAROL, x: 260, y: 197, location: 'outdoors', facing: 'down', moving: false });
    now += 16;
    t.frame();
    const root = rootOf(t);
    const labels = root.all().filter((e) => e.className === 'ct-v3-label');
    const bubbles = root.all().filter((e) => e.className === 'ct-v3-bubble' && e.style.visibility === 'visible');
    expect(labels.map((l) => l.textContent).sort()).toEqual(['Bob', 'Carol', 'Me']);
    expect(bubbles).toHaveLength(2);
    const carol = labels.find((l) => l.textContent === 'Carol')!;
    const bobBubble = bubbles.find((b) => b.children.some((c) => c.textContent === 'Over your name'))!;
    expect(root.children.indexOf(carol)).toBeGreaterThan(root.children.indexOf(bobBubble)); // created later
    expect(overlaps(boxOfEl(carol), boxOfEl(bobBubble))).toBe(true); // it really covers her name
    for (const b of bubbles) for (const l of labels) expect(paintsAbove(root, b, l), `${b.className} over ${l.textContent}`).toBe(true);
    // and the FX canvas (pins, markers) stays under both
    const canvas = root.children.find((c) => c.tagName === 'canvas')!;
    expect(Number(canvas.style.zIndex)).toBeLessThan(Math.min(...labels.map((l) => Number(l.style.zIndex))));
    positions.delete(CAROL);
    t.layer.destroy();
  });

  it('a lifted bubble drops its tail (display, so a hidden box never leaks a visible child)', () => {
    const t = setup();
    // two speakers side by side: the newer bubble climbs over the older one
    positions.set(BOB, { x: 204, y: 200 });
    t.remotes.set(BOB, { ...t.remotes.get(BOB)!, x: 204 });
    t.frame();
    t.events.emit('chat:message', chat(ME, 'first one here'));
    t.events.emit('chat:message', chat(BOB, 'second one here'));
    t.frame();
    const els = rootOf(t).all().filter((e) => e.className === 'ct-v3-bubble');
    const tails = els.map((e) => e.children.find((c) => c.className === 'ct-v3-bubble-tail')!);
    expect(tails.map((x) => x.style.display).sort()).toEqual(['', 'none']);
    for (const x of tails) expect(x.style.visibility ?? '').toBe(''); // inherits the box's visibility
    t.layer.destroy();
  });

  it('D2 budget: 15 walking labels with bubbles, 3 crossing the view edge, write ≤ 5 non-transform DOM changes per second, ≤ 1 transform per element per frame, none under 0.5 px', () => {
    const crowd: string[] = [];
    const start = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < 14; i++) {
      const pid = `p_w${i}`;
      crowd.push(pid);
      start.set(pid, { x: 40 + (i % 7) * 50, y: 140 + Math.floor(i / 7) * 60 });
    }
    // three walkers cross the canvas edge during the measured second (60 world px = 120 CSS px of walking):
    // two leave on the right (head x 900 / 910 CSS -> past 960), one comes in from the left (-80 -> +40 CSS)
    start.set('p_w11', { x: 450, y: 200 });
    start.set('p_w12', { x: 455, y: 140 });
    start.set('p_w13', { x: -40, y: 200 });
    // WP2's registry: everyone is drawn in our place, on screen or not; anchorOf is null off the canvas
    const t = setup({ view: clipView as View3d, avatars: clipAvatars, avatarShown: (pid) => pid === ME || crowd.includes(pid) });
    for (const pid of crowd) {
      const p = start.get(pid)!;
      positions.set(pid, { ...p });
      (t.state.members as Map<string, MemberLook>).set(pid, { name: `Walker ${pid.slice(2)}`, castId: 'fox', seat: null, role: 'player' });
      t.remotes.set(pid, { pid, x: p.x, y: p.y, location: 'outdoors', facing: 'right', moving: true });
    }
    t.remotes.delete(BOB);
    t.frame();
    for (const pid of crowd.slice(0, 5)) t.events.emit('chat:message', chat(pid, `walking and talking ${pid}`));
    for (let i = 0; i < 20; i++) {
      now += 16;
      t.frame(); // fade-in done, sizes measured
    }
    const root = rootOf(t);
    const labelEls = root.all().filter((e) => e.className === 'ct-v3-label');
    expect(labelEls).toHaveLength(15); // the off-canvas walker's label exists already (hidden)
    const visibleLabels = () => labelEls.filter((e) => e.style.visibility === 'visible').map((e) => e.textContent).sort();
    expect(visibleLabels()).not.toContain('Walker w13');
    expect(visibleLabels()).toContain('Walker w11');
    expect(root.all().filter((e) => e.className === 'ct-v3-bubble' && e.style.visibility === 'visible')).toHaveLength(5);
    const ov = () => ({ ...(t.hook.overlay!() as { transforms: number; visibility: number; content: number }) });
    // sub-threshold moves (0.2 world px = 0.4 CSS px) write nothing at all
    const s0 = ov();
    for (const pid of crowd) positions.set(pid, { x: positions.get(pid)!.x + 0.2, y: positions.get(pid)!.y });
    now += 16;
    t.frame();
    const s1 = ov();
    expect([s1.transforms, s1.visibility, s1.content]).toEqual([s0.transforms, s0.visibility, s0.content]);
    // one second of walking at 60 fps, 1 world px (2 CSS px) per frame
    const frames = 60;
    const f0 = frameId;
    const created0 = created.length;
    for (let f = 0; f < frames; f++) {
      for (const pid of crowd) {
        const p = positions.get(pid)!;
        positions.set(pid, { x: p.x + 1, y: p.y });
        const r = t.remotes.get(pid)!;
        t.remotes.set(pid, { ...r, x: r.x + 1 });
      }
      now += 1000 / 60;
      t.frame();
    }
    const s2 = ov();
    // the crossings really happened: the two leavers are hidden, the newcomer shows
    expect(visibleLabels()).toContain('Walker w13');
    expect(visibleLabels()).not.toContain('Walker w11');
    expect(visibleLabels()).not.toContain('Walker w12');
    // one visibility write per crossing; no element made, removed, re-texted or re-styled
    expect(s2.content - s1.content).toBe(0);
    expect(s2.visibility - s1.visibility).toBe(3);
    expect(created.length).toBe(created0);
    expect(s2.visibility - s1.visibility + (s2.content - s1.content)).toBeLessThanOrEqual(5);
    // ≤ 1 transform per element per frame (counted per element from the style write log)
    const perElFrame = new Map<string, number>();
    root.all().forEach((e, k) => {
      for (const w of e.log) if (w.prop === 'transform' && w.frame > f0) perElFrame.set(`${k}|${w.frame}`, (perElFrame.get(`${k}|${w.frame}`) ?? 0) + 1);
    });
    expect(Math.max(...perElFrame.values())).toBe(1);
    expect(s2.transforms - s1.transforms).toBeGreaterThanOrEqual(11 * frames); // the on-screen walkers' labels really moved
    for (const pid of crowd) positions.delete(pid);
    t.layer.destroy();
  });

  it('a fade steps 0 → ¼ → ½ → ¾ → 1 in and 1 → ¾ → ½ → ¼ → 0 out, one write each, then hides', () => {
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'bye'));
    t.frame();
    const el = rootOf(t).all().find((e) => e.className === 'ct-v3-bubble')!;
    expect(el.style.opacity).toBe('0');
    const n0 = el.log.length;
    for (let i = 0; i < 500; i++) {
      now += 16;
      t.frame();
    }
    const writes = el.log.slice(n0).filter((w) => w.prop === 'opacity').map((w) => w.value);
    expect(writes).toEqual(['0.25', '0.5', '0.75', '1', '0.75', '0.5', '0.25', '0']);
    expect(el.style.visibility).toBe('hidden');
    t.layer.destroy();
  });
});

// ---------------------------------------------------------------------------------------- fix round (D2 review)
const { Z_ORDER } = await import('../../src/game3d/overlay/surface');
const { SPEECH, bubbleDurationMs } = await import('../../src/game/social/speech');

describe('overlay: bubble slots belong to the speaker, not to a list index', () => {
  const SPK = ['p_s0', 'p_s1', 'p_s2', 'p_s3', 'p_s4'];
  /** Five speakers in a row, far enough apart that no bubble climbs over another. */
  function five() {
    const t = setup();
    SPK.forEach((pid, i) => {
      const p = { x: 40 + i * 70, y: 250 };
      positions.set(pid, p);
      (t.state.members as Map<string, MemberLook>).set(pid, { name: `S${i}`, castId: 'fox', seat: null, role: 'player' });
      t.remotes.set(pid, { pid, x: p.x, y: p.y, location: 'outdoors', facing: 'down', moving: false });
    });
    t.remotes.delete(BOB);
    t.frame();
    const t0 = now;
    // oldest first, 800 ms apart (> the 600 ms fade-out), same length (same duration)
    SPK.forEach((pid, i) => {
      t.events.emit('chat:message', chat(pid, `line number ${i}`));
      now += 800;
      t.frame();
    });
    for (let i = 0; i < 10; i++) {
      now += 16;
      t.frame();
    }
    const els = new Map<string, FakeEl>();
    for (const e of rootOf(t).all().filter((x) => x.className === 'ct-v3-bubble')) {
      const txt = e.children.find((c) => c.tagName === '#text')!.textContent;
      els.set(SPK[Number(/(\d)$/.exec(txt)![1])]!, e);
    }
    expect(els.size).toBe(5);
    return { t, t0, els };
  }
  /** Every write to a bubble element (box styles, tail styles, its text node) in overlay frames > f0. */
  const writesSince = (e: FakeEl, f0: number) => {
    const tail = e.children.find((c) => c.className === 'ct-v3-bubble-tail')!;
    const text = e.children.find((c) => c.tagName === '#text') as unknown as FakeText;
    return { box: e.log.filter((w) => w.frame > f0), tail: tail.log.filter((w) => w.frame > f0), text };
  };

  it('the oldest of 5 bubbles expiring hides only its own element: the other 4 get no text, size, measure or move', () => {
    const { t, t0, els } = five();
    const until = t0 + bubbleDurationMs('line number 0');
    now = until - 1;
    t.frame();
    const f0 = frameId;
    const texts = SPK.slice(1).map((pid) => (els.get(pid)!.children.find((c) => c.tagName === '#text') as unknown as FakeText).writes);
    const r0 = rectReads;
    now = until + 1;
    t.frame();
    expect((t.hook.bubbles!() as Shown).map((b) => b.pid)).toEqual(SPK.slice(1));
    expect(els.get(SPK[0]!)!.style.visibility).toBe('hidden');
    SPK.slice(1).forEach((pid, k) => {
      const w = writesSince(els.get(pid)!, f0);
      expect(w.box, pid).toEqual([]);
      expect(w.tail, pid).toEqual([]);
      expect(w.text.writes, pid).toBe(texts[k]);
    });
    expect(rectReads).toBe(r0); // no probe measuring at all
    t.layer.destroy();
  });

  it('a speaker posting again rewrites only that slot (and lifts it to the top of the bubble paint order)', () => {
    const { t, els } = five();
    const f0 = frameId;
    const r0 = rectReads;
    t.events.emit('chat:message', chat(SPK[1]!, 'a much longer second line'));
    now += 16;
    t.frame();
    const root = rootOf(t);
    const mine = els.get(SPK[1]!)!;
    expect(mine.children.find((c) => c.tagName === '#text')!.textContent).toBe('a much longer second line');
    expect(writesSince(mine, f0).box.some((w) => w.prop === 'width')).toBe(true);
    expect(rectReads - r0).toBe(1); // one probe measure: this bubble's
    for (const pid of [SPK[0]!, SPK[2]!, SPK[3]!, SPK[4]!]) {
      const w = writesSince(els.get(pid)!, f0);
      expect(w.box.filter((x) => x.prop !== 'transform'), pid).toEqual([]);
      expect(w.tail.filter((x) => x.prop !== 'transform'), pid).toEqual([]);
    }
    const bubbleOrder = root.children.filter((c) => c.className === 'ct-v3-bubble');
    expect(bubbleOrder[bubbleOrder.length - 1]).toBe(mine);
    // a freed slot is reused by the next new speaker (no new element)
    now += SPEECH.maxMs + 100;
    t.frame();
    const nEls = root.all().filter((e) => e.className === 'ct-v3-bubble').length;
    t.events.emit('chat:message', chat(ME, 'reusing a slot'));
    t.frame();
    expect(root.all().filter((e) => e.className === 'ct-v3-bubble').length).toBe(nEls);
    expect((t.hook.bubbles!() as Shown).map((b) => b.text)).toEqual(['reusing a slot']);
    for (const pid of SPK) positions.delete(pid);
    t.layer.destroy();
  });

  it('the tail tip sits on the speaker: translate3d(tailX − 2·px − 3·px, (bh + 1 − 4)·px − 3·px) at px 2', () => {
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'Hello there'));
    t.frame();
    const el = rootOf(t).all().find((e) => e.className === 'ct-v3-bubble')!;
    const tail = el.children.find((c) => c.className === 'ct-v3-bubble-tail')!;
    const px = 2;
    const left = transformOf(el)!.x;
    const w = parseFloat(el.style.width!);
    const bh = parseFloat(el.style.height!) / px;
    const tailX = Math.max(3 * px, Math.min(w - 3 * px, Math.round(260 * 2 - left))); // Bob's head x (CSS) − box left
    expect(tail.style.transform).toBe(`translate3d(${tailX - 2 * px - 3 * px}px, ${(bh + 1 - 4) * px - 3 * px}px, 0)`);
    expect([tail.style.width, tail.style.height]).toEqual([`${7 * px}px`, `${5 * px}px`]);
    t.layer.destroy();
  });
});

describe('overlay: paint order of badges, bubbles and tooltips', () => {
  it('a door-board "+N" badge paints under a chat bubble; only tooltips are above bubbles', () => {
    expect(Z_ORDER.label).toBeLessThan(Z_ORDER.badge);
    expect(Z_ORDER.badge).toBeLessThan(Z_ORDER.bubble);
    expect(Z_ORDER.bubble).toBeLessThan(Z_ORDER.tip);
    const t = setup();
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    const tags = ['a', 'b', 'c', 'd', 'e'].map((pid) => ({ pid, name: pid.toUpperCase(), ghost: false, preset: 'frog' }));
    doorTagsStore.set({ [house.id]: { tags, shown: tags.slice(0, 4), overflow: 1 } });
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'over the board'));
    t.frame();
    const root = rootOf(t);
    const badge = root.all().find((e) => e.textContent === '+1' && e.className.startsWith('ct-v3-'))!;
    expect(badge.className).toBe('ct-v3-badge');
    const bubble = root.all().find((e) => e.className === 'ct-v3-bubble')!;
    expect(paintsAbove(root, bubble, badge)).toBe(true);
    t.layer.destroy();
  });
});

describe('overlay: bubble art before the atlas decoded, measuring', () => {
  it('fallback panel: bubble fill with the 1-texel edge on the OUTER edge (outline inset by −px), then the 9-slice', () => {
    atlasState.noUrl = true;
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'early bird'));
    t.frame();
    const el = rootOf(t).all().find((e) => e.className === 'ct-v3-bubble')!;
    const tail = el.children.find((c) => c.className === 'ct-v3-bubble-tail')!;
    expect(el.style.borderImageSource).toBe('none');
    expect(el.style.backgroundColor).toBe(el.style.borderColor);
    expect(el.style.outline).toBe('2px solid #8a7448');
    expect(el.style.outlineOffset).toBe('-2px');
    expect(el.style.boxShadow).toBeUndefined();
    expect(tail.style.display).toBe('none'); // no tail art yet
    atlasState.noUrl = false;
    now += 16;
    t.frame();
    expect(el.style.borderImageSource).toBe('url("data:image/png;base64,bubble_nine")');
    expect(el.style.outline).toBe('none');
    expect(el.style.backgroundColor).toBe('transparent');
    expect(tail.style.display).toBe('');
    t.layer.destroy();
  });

  it('text measures round UP to whole px, a 0 × 0 measure (hidden town) is retried, web fonts arriving re-measure once', () => {
    hiddenTown = true;
    const t = setup();
    t.frame();
    t.events.emit('chat:message', chat(BOB, 'measure me'));
    t.frame();
    const root = rootOf(t);
    const label = root.all().find((e) => e.className === 'ct-v3-label' && e.textContent === 'Bob')!;
    const el = root.all().find((e) => e.className === 'ct-v3-bubble')!;
    const r0 = rectReads;
    t.frame(); // still hidden: measured again (2 labels + 1 bubble)
    expect(rectReads - r0).toBe(3);
    hiddenTown = false;
    t.frame();
    const r1 = rectReads;
    t.frame();
    t.frame();
    expect(rectReads).toBe(r1); // measured: no more reads
    // 'measure me' = 10 chars × 7 = 70 CSS px, reported as 70.4 (offsetWidth would say 70): ceil -> 71 CSS px
    // -> 36 texels + 2 × padX 5
    expect(el.style.width).toBe(`${(36 + 10) * 2}px`);
    const lb = (t.hook.overlay!() as { labels: number }).labels;
    expect(lb).toBe(2);
    expect(label.style.visibility).toBe('visible');
    // the web fonts finish loading: every label and bubble is measured once more, then never again
    for (const fn of fontListeners) fn({});
    t.frame();
    expect(rectReads - r1).toBe(3);
    const r2 = rectReads;
    t.frame();
    expect(rectReads).toBe(r2);
    const nl = fontListeners.size;
    t.layer.destroy();
    expect(fontListeners.size).toBe(nl - 1);
  });
});
