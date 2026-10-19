// (v3 WP6, v3-ui) The v3 DOM skin switch (ui/common/v3skin.ts + v3skinLobby.ts): the §3.1 hour the skin follows,
// the token / night-atlas rules, and attaching to lobby connections (only v3 lobbies, ref-counted, one lobby
// at a time). The lazy atlas chunk is mocked (no fetch in node).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayClockView, LobbyRoomView, PlayerGameView, StorytellerGameView } from '@ct/protocol';
import { createStore } from '../src/net/store';

const skinCalls: string[] = [];
vi.mock('../src/ui/common/v3atlas', () => ({
  v3atlas: {
    ready: () => Promise.resolve(true),
    loaded: () => true,
    skin: (look: string) => skinCalls.push(`skin:${look}`),
    unskin: () => skinCalls.push('unskin'),
    castStrip: () => null,
    frame: () => null,
  },
}));

const { v3Skin, v3AtlasNow } = await import('../src/ui/common/v3skin');
const { attachV3Skin, clockProgress, isNightHour, lookOf, skinHour } = await import('../src/ui/common/v3skinLobby');

const clock = (c: Partial<DayClockView>): DayClockView => ({ stage: 'discussion', endsAt: null, remainingMs: null, paused: false, totalMs: 60_000, ...c });
const view = (clockV: DayClockView | null, nominationsOpen = false) => ({ clock: clockV, day: { nominationsOpen, nominations: [], onTheBlock: null, executedSeat: null } });

describe('skin hour (§3.1)', () => {
  const now = 1_000_000;
  it('waiting, setup and finished hold their hour', () => {
    expect(skinHour('waiting', null, now)).toBe(10);
    expect(skinHour('setup', null, now)).toBe(10);
    expect(skinHour('finished', null, now)).toBe(12.5);
    expect(skinHour('night', null, now)).toBe(23);
    expect(skinHour('first_night', null, now)).toBe(23);
  });
  it('day without a clock holds the stage start hour', () => {
    expect(skinHour('day', view(null), now)).toBe(11);
    expect(skinHour('day', view(null, true), now)).toBe(15);
  });
  it('running clock (endsAt)', () => {
    expect(skinHour('day', view(clock({ endsAt: now + 30_000 })), now)).toBeCloseTo(13);
    expect(skinHour('day', view(clock({ stage: 'nominations', endsAt: now })), now)).toBeCloseTo(18);
    expect(skinHour('day', view(clock({ endsAt: now + 120_000 })), now)).toBe(11); // clamped
  });
  it('paused clock uses remainingMs', () => {
    expect(clockProgress(clock({ paused: true, remainingMs: 15_000 }), now)).toBeCloseTo(0.75);
    expect(skinHour('day', view(clock({ stage: 'nominations', paused: true, remainingMs: 40_000 })), now)).toBeCloseTo(16);
  });
  it('bedtime walks from 18:30 to 19:45', () => {
    expect(skinHour('bedtime', view(null), now)).toBe(18.5);
    expect(skinHour('bedtime', view(clock({ stage: 'bedtime', endsAt: now })), now)).toBeCloseTo(19.75);
  });
  it('dawn eases 06:15 → 08:00 over 20 s from phase entry', () => {
    expect(skinHour('dawn', null, now, now)).toBe(6.25);
    expect(skinHour('dawn', null, now + 10_000, now)).toBeCloseTo(7.125);
    expect(skinHour('dawn', null, now + 60_000, now)).toBe(8);
  });
  it('looks: day < 16, golden < 19:45, else night; night atlases ≥ 19:45 or < 06:15', () => {
    expect([lookOf(10), lookOf(15.99), lookOf(16), lookOf(19.7), lookOf(19.75), lookOf(23), lookOf(3), lookOf(6.25)]).toEqual(['day', 'day', 'golden', 'golden', 'night', 'night', 'night', 'day']);
    expect([isNightHour(19.74), isNightHour(19.75), isNightHour(6.24), isNightHour(6.25)]).toEqual([false, true, true, false]);
  });
});

function fakeConn(world: 'v2' | 'v3' | undefined) {
  const lobby = { lobby: { world } , world } as unknown as LobbyRoomView;
  return {
    lobbyView: createStore<LobbyRoomView | null>(lobby),
    gameView: createStore<PlayerGameView | StorytellerGameView | null>(null),
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('attachV3Skin', () => {
  afterEach(() => {
    skinCalls.length = 0;
  });
  it('a v2 lobby leaves the skin off', async () => {
    const off = attachV3Skin(fakeConn('v2'));
    await flush();
    expect(v3Skin.get().on).toBe(false);
    expect(v3AtlasNow()).toBeNull();
    off();
    const legacy = attachV3Skin(fakeConn(undefined)); // absent world = v2
    expect(v3Skin.get().on).toBe(false);
    legacy();
  });
  it('a v3 lobby turns it on, follows the night, and is ref-counted', async () => {
    const c = fakeConn('v3');
    const a = attachV3Skin(c);
    const b = attachV3Skin(c);
    await flush();
    await flush();
    expect(v3Skin.get()).toMatchObject({ on: true, look: 'day', night: false });
    expect(skinCalls).toContain('skin:day');
    expect(v3AtlasNow()).not.toBeNull();
    c.gameView.set({ phase: 'night', clock: null, day: null } as unknown as PlayerGameView);
    await flush();
    await flush();
    expect(v3Skin.get()).toMatchObject({ on: true, look: 'night', night: true, hour: 23 });
    expect(skinCalls).toContain('skin:night');
    a();
    expect(v3Skin.get().on).toBe(true); // b still holds it
    b();
    expect(v3Skin.get().on).toBe(false);
    expect(skinCalls.at(-1)).toBe('unskin');
    b(); // releasing twice is harmless
    expect(v3Skin.get().on).toBe(false);
  });
  it('joining another lobby replaces the first one', async () => {
    const one = fakeConn('v3');
    const releaseOne = attachV3Skin(one);
    await flush();
    expect(v3Skin.get().on).toBe(true);
    const releaseTwo = attachV3Skin(fakeConn('v2'));
    expect(v3Skin.get().on).toBe(false);
    releaseOne(); // the stale release does not touch the new lobby
    expect(v3Skin.get().on).toBe(false);
    releaseTwo();
  });
});
