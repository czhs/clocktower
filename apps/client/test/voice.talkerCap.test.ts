import { describe, expect, it } from 'vitest';
import { capStep, TALKER_CAP_INITIAL, type TalkerCapState, type TalkerInfo } from '../src/voice/talkerCap';

const T = (pid: string, o: Partial<TalkerInfo> = {}): TalkerInfo => ({ pid, speaking: false, lastSpokeMs: null, distPx: 100, ...o });
const ids = (s: TalkerCapState) => [...s.on.keys()].sort();
const opts = { max: 3, holdMs: 4000, minOnMs: 3000 };

describe('capStep (v2.4: decode only the N most relevant talkers)', () => {
  it('everyone fits: all subscribed, state object reused when nothing changed', () => {
    const ts = [T('a'), T('b')];
    const s1 = capStep(TALKER_CAP_INITIAL, ts, 0, opts);
    expect(ids(s1)).toEqual(['a', 'b']);
    expect(capStep(s1, ts, 500, opts)).toBe(s1);
  });

  it('pre-fills free slots with the nearest silent people', () => {
    const ts = [T('far', { distPx: 900 }), T('near', { distPx: 10 }), T('mid', { distPx: 300 }), T('mid2', { distPx: 310 })];
    expect(ids(capStep(TALKER_CAP_INITIAL, ts, 0, opts))).toEqual(['mid', 'mid2', 'near']);
  });

  it('a newcomer who talks takes the slot of an inactive holder, never of an active one', () => {
    let s = capStep(TALKER_CAP_INITIAL, [T('a'), T('b'), T('c'), T('d', { distPx: 999 })], 0, opts);
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    // a, b, c all talking: d talks too but waits
    const talking = (now: number, who: string[]) => ['a', 'b', 'c', 'd'].map((p) => T(p, { speaking: who.includes(p), lastSpokeMs: who.includes(p) ? now : null, distPx: p === 'd' ? 999 : 100 }));
    s = capStep(s, talking(5000, ['a', 'b', 'c', 'd']), 5000, opts);
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    // c stops; within holdMs c keeps its slot
    const t2 = talking(7000, ['a', 'b', 'd']).map((x) => (x.pid === 'c' ? { ...x, lastSpokeMs: 5000 } : x));
    s = capStep(s, t2, 7000, opts);
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    // c silent for > holdMs: d (talking) gets the slot
    const t3 = talking(9500, ['a', 'b', 'd']).map((x) => (x.pid === 'c' ? { ...x, lastSpokeMs: 5000 } : x));
    s = capStep(s, t3, 9500, opts);
    expect(ids(s)).toEqual(['a', 'b', 'd']);
  });

  it('a fresh subscription is kept for minOnMs even when silent (no flapping)', () => {
    const base = [T('a', { lastSpokeMs: -10_000 }), T('b', { lastSpokeMs: -10_000 }), T('c', { lastSpokeMs: -10_000 })];
    let s = capStep(TALKER_CAP_INITIAL, base, 0, { ...opts, max: 2 });
    expect(s.on.size).toBe(2);
    const out = ['a', 'b', 'c'].find((p) => !s.on.has(p))!;
    // the left-out one talks at t=1000 -> takes a slot (holders silent > holdMs, but on < minOnMs: they stay)
    const withTalk = base.map((x) => (x.pid === out ? { ...x, speaking: true, lastSpokeMs: 1000 } : x));
    s = capStep(s, withTalk, 1000, { ...opts, max: 2 });
    expect(s.on.has(out)).toBe(false);
    s = capStep(s, withTalk, 3500, { ...opts, max: 2 });
    expect(s.on.has(out)).toBe(true);
    // and the newcomer now keeps the slot through a short pause
    const paused = base.map((x) => (x.pid === out ? { ...x, speaking: false, lastSpokeMs: 3500 } : x));
    s = capStep(s, paused, 4500, { ...opts, max: 2 });
    expect(s.on.has(out)).toBe(true);
  });

  it('pinned (Storyteller) is always decoded and counts toward the cap', () => {
    const ts = [T('st', { pinned: true, distPx: 5000 }), T('a', { speaking: true, lastSpokeMs: 0 }), T('b', { speaking: true, lastSpokeMs: 0 }), T('c', { speaking: true, lastSpokeMs: 0 })];
    const s = capStep(TALKER_CAP_INITIAL, ts, 0, opts);
    expect(s.on.has('st')).toBe(true);
    expect(s.on.size).toBe(3);
  });

  it('people who leave are dropped; slots keep their original since', () => {
    let s = capStep(TALKER_CAP_INITIAL, [T('a'), T('b'), T('c'), T('d', { distPx: 999 })], 0, opts);
    const sinceA = s.on.get('a');
    s = capStep(s, [T('a'), T('c'), T('d', { distPx: 999 })], 100, opts);
    expect(ids(s)).toEqual(['a', 'c', 'd']);
    expect(s.on.get('a')).toBe(sinceA);
    expect(s.on.get('d')).toBe(100);
  });

  it('a crowd of 15 with 10 simultaneous talkers decodes at most N, stable over time', () => {
    const N = 6;
    let s = TALKER_CAP_INITIAL;
    let changes = 0;
    for (let now = 0; now < 60_000; now += 100) {
      // talkers rotate slowly: person i talks during its own 7 s window out of every 10 s
      const ts = Array.from({ length: 15 }, (_, i) => {
        const talking = i < 10 && (now + i * 1000) % 10_000 < 7000;
        return T(`p${i}`, { speaking: talking, lastSpokeMs: talking ? now : null, distPx: 50 + i * 20 });
      });
      const next = capStep(s, ts, now, { max: N });
      expect(next.on.size).toBeLessThanOrEqual(N);
      if (next !== s) changes++;
      s = next;
    }
    // hysteresis: far fewer subscription changes than ticks (600)
    expect(changes).toBeLessThan(60);
  });
});
