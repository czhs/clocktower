// social-client: pure helpers behind emotes + pins (apps/client/src/game/social/logic.ts).
import { describe, expect, it } from 'vitest';
import { MAX_PINS_PER_MEMBER, PIN_COLORS, type PinView } from '@ct/protocol';
import {
  createBucket,
  crispScale,
  EMOTE_BUCKET,
  emoteAlpha,
  evictedByDrop,
  fanSlot,
  handPose,
  isPinColor,
  loadPinColor,
  LONG_PRESS_MS,
  personStacks,
  PIN_BUCKET,
  PIN_COLOR_KEY,
  PIN_HEX,
  pinLabel,
  PRESS_SLOP_PX,
  pressState,
  reconcileLocal,
  sameDrop,
  savePinColor,
  type LocalPin,
} from '../src/game/social/logic';

const pin = (id: string, by: string, target: PinView['target'], at = 0, color: PinView['color'] = 'gold'): PinView => ({ id, by, character: 'frog', color, target, at });

describe('rate limit buckets (mirror the server)', () => {
  it('allows the burst, then refills slower than the server', () => {
    const b = createBucket(EMOTE_BUCKET);
    for (let i = 0; i < EMOTE_BUCKET.capacity; i++) expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(false);
    // the server would allow one more after 500 ms (2/s); we wait a little longer (10% margin)
    expect(b.take(1500)).toBe(false);
    expect(b.take(1560)).toBe(true);
  });
  it('never exceeds what the server bucket would accept over a long spam run', () => {
    const b = createBucket(PIN_BUCKET);
    let tokens: number = PIN_BUCKET.capacity;
    let last = 0;
    for (let t = 0; t < 20_000; t += 37) {
      tokens = Math.min(PIN_BUCKET.capacity, tokens + ((t - last) / 1000) * PIN_BUCKET.refillPerSec);
      last = t;
      if (b.take(t)) {
        expect(tokens).toBeGreaterThanOrEqual(1);
        tokens -= 1;
      }
    }
  });
  it('peek does not consume', () => {
    const b = createBucket({ capacity: 1, refillPerSec: 1 });
    expect(b.peek(0)).toBe(true);
    expect(b.peek(0)).toBe(true);
    expect(b.take(0)).toBe(true);
    expect(b.peek(0)).toBe(false);
  });
});

describe('pin colour memory', () => {
  it('has a swatch for every protocol colour', () => {
    for (const c of PIN_COLORS) expect(PIN_HEX[c].fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(PIN_HEX).sort()).toEqual([...PIN_COLORS].sort());
  });
  it('round-trips through storage and rejects junk', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadPinColor(s)).toBe('gold');
    savePinColor(s, 'teal');
    expect(m.get(PIN_COLOR_KEY)).toBe('teal');
    expect(loadPinColor(s)).toBe('teal');
    m.set(PIN_COLOR_KEY, '<script>');
    expect(loadPinColor(s, 'violet')).toBe('violet');
    expect(isPinColor('crimson')).toBe(true);
    expect(isPinColor('pink')).toBe(false);
  });
  it('survives blocked storage', () => {
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPinColor(boom, 'green')).toBe('green');
    expect(() => savePinColor(boom, 'green')).not.toThrow();
    expect(loadPinColor(null)).toBe('gold');
  });
});

describe('crispScale', () => {
  it('maps each texel to a whole number of canvas pixels', () => {
    for (const zoom of [0.6, 1, 1.06, 2.45, 3, 6.5]) {
      const s = crispScale(zoom, 1, 38, 34);
      const px = s * zoom; // canvas px per texel
      expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9);
      expect(px).toBeGreaterThanOrEqual(1);
    }
  });
  it('keeps the on-screen size roughly constant across zooms', () => {
    const h = (z: number) => crispScale(z, 1, 10, 20) * z * 10;
    expect(h(1)).toBe(20);
    expect(h(2.45)).toBe(20);
    expect(h(5)).toBe(20);
  });
  it('honours the device pixel ratio', () => {
    expect(crispScale(1, 2, 10, 20) * 1 * 2 * 10).toBe(40);
  });
});

describe('person pin stacks', () => {
  it('fans out symmetrically and tilts outward', () => {
    expect(fanSlot(0, 1, 26)).toEqual({ dx: 0, dy: 0, rot: 0 });
    const n = 3;
    const s = [0, 1, 2].map((i) => fanSlot(i, n, 26));
    expect(s[1]!.dx).toBe(0);
    expect(s[0]!.dx).toBeCloseTo(-s[2]!.dx);
    expect(s[0]!.rot).toBeLessThan(0);
    expect(s[2]!.rot).toBeGreaterThan(0);
    // the whole fan stays within ~2 pin widths even for a full stack of 6
    const six = [0, 1, 2, 3, 4, 5].map((i) => fanSlot(i, 6, 26));
    expect(six[5]!.dx - six[0]!.dx).toBeLessThanOrEqual(2 * 26 + 1);
  });
  it('groups person pins by target, oldest first; ignores place pins', () => {
    const list = [pin('a', 'p1', { kind: 'person', pid: 'x' }, 30), pin('b', 'p2', { kind: 'person', pid: 'x' }, 10), pin('c', 'p1', { kind: 'place', x: 1, y: 2 }, 5), pin('d', 'p1', { kind: 'person', pid: 'y' }, 1)];
    const m = personStacks(list);
    expect([...m.keys()].sort()).toEqual(['x', 'y']);
    expect(m.get('x')!.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('optimistic drops', () => {
  const local = (id: string, target: PinView['target'], t = 0, color: PinView['color'] = 'gold'): LocalPin => ({ id, color, target, t });
  it('matches the server copy by colour + target', () => {
    expect(sameDrop(local('~1', { kind: 'place', x: 100, y: 100 }), pin('s', 'me', { kind: 'place', x: 100.4, y: 99.6 }))).toBe(true);
    expect(sameDrop(local('~1', { kind: 'place', x: 100, y: 100 }), pin('s', 'me', { kind: 'place', x: 100, y: 100 }, 0, 'teal'))).toBe(false);
    expect(sameDrop(local('~1', { kind: 'person', pid: 'a' }), pin('s', 'me', { kind: 'person', pid: 'a' }))).toBe(true);
    expect(sameDrop(local('~1', { kind: 'person', pid: 'a' }), pin('s', 'me', { kind: 'person', pid: 'b' }))).toBe(false);
    expect(sameDrop(local('~1', { kind: 'person', pid: 'a' }), pin('s', 'me', { kind: 'place', x: 0, y: 0 }))).toBe(false);
  });
  it('adopts new server pins, ignores ones already on screen and other people’s, expires stale drops', () => {
    const locals = [local('~1', { kind: 'person', pid: 'a' }, 0), local('~2', { kind: 'place', x: 5, y: 5 }, 0), local('~3', { kind: 'place', x: 900, y: 900 }, 0)];
    const server = [
      pin('old', 'me', { kind: 'person', pid: 'a' }), // already shown: not a new drop
      pin('new', 'me', { kind: 'person', pid: 'a' }),
      pin('theirs', 'other', { kind: 'place', x: 5, y: 5 }),
    ];
    const r = reconcileLocal(locals, server, 'me', new Set(['old']), 1000);
    expect([...r.adopted]).toEqual([['~1', 'new']]);
    expect(r.waiting.map((l) => l.id)).toEqual(['~2', '~3']);
    expect(reconcileLocal(locals, [], 'me', new Set(), 10_000).waiting).toEqual([]);
  });
  it('predicts which of my pins the server evicts at the cap', () => {
    const mine = Array.from({ length: MAX_PINS_PER_MEMBER }, (_, i) => ({ id: `p${i}`, at: 100 - i }));
    expect(evictedByDrop(mine)).toEqual([`p${MAX_PINS_PER_MEMBER - 1}`]);
    expect(evictedByDrop(mine.slice(0, 2))).toEqual([]);
  });
});

describe('long-press', () => {
  it('becomes long after the hold time, cancels on a drag, sticks once decided', () => {
    expect(pressState(0, LONG_PRESS_MS - 1, 0)).toBe('pending');
    expect(pressState(0, LONG_PRESS_MS, 3)).toBe('long');
    expect(pressState(0, 100, PRESS_SLOP_PX + 1)).toBe('cancelled');
    expect(pressState(0, 1000, 999, 'long')).toBe('long');
    expect(pressState(0, 1000, 0, 'cancelled')).toBe('cancelled');
  });
});

describe('point emote geometry', () => {
  it('puts the hand toward the target and flips it when pointing left', () => {
    const r = handPose({ x: 100, y: 100 }, { x: 200, y: 84 });
    expect(r.x).toBeGreaterThan(100);
    expect(r.flip).toBe(false);
    const l = handPose({ x: 100, y: 100 }, { x: 0, y: 100 });
    expect(l.x).toBeLessThan(100);
    expect(l.flip).toBe(true);
    expect(Number.isFinite(handPose({ x: 1, y: 1 }, { x: 1, y: -9 }).angle)).toBe(true);
  });
  it('fades in, holds, fades out within its life', () => {
    expect(emoteAlpha(-1, 3500)).toBe(0);
    expect(emoteAlpha(60, 3500)).toBeCloseTo(0.5);
    expect(emoteAlpha(1500, 3500)).toBe(1);
    expect(emoteAlpha(3200, 3500)).toBeCloseTo(0.5);
    expect(emoteAlpha(3500, 3500)).toBe(0);
  });
});

describe('pin labels', () => {
  it('reads naturally', () => {
    expect(pinLabel({ byName: 'Ada', mine: false })).toBe('Ada’s pin');
    expect(pinLabel({ byName: 'Ada', mine: true })).toBe('Your pin');
    expect(pinLabel({ byName: 'Ada', mine: false, targetName: 'Bram' })).toBe('Ada’s pin on Bram');
    expect(pinLabel({ byName: 'Ada', mine: false, targetName: 'Bram', targetIsMe: true })).toBe('Ada’s pin on you');
    expect(pinLabel({ byName: 'Ada', mine: true, targetName: null })).toBe('Your pin');
  });
});
