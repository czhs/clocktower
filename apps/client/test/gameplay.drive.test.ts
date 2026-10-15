// OWNED BY gameplay. The server-driven local avatar (apps/client/src/game/gameplay/drive.ts) must
// hand control back as soon as the server stops driving (snapshot without `you`), even though
// snapshots keep arriving every ~83 ms (SNAPSHOT_HZ = 12) — i.e. faster than the 110 ms
// interpolation delay. Regression for "the player can never walk again after an escort".
import type { WorldSnapshot } from '@ct/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelfDriver } from '../src/game/gameplay/drive';

let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);
afterEach(() => {
  now = 0;
});

const ME = 'p_me';
const snap = (x: number, you: WorldSnapshot['you']): WorldSnapshot => ({
  t: now,
  ackSeq: 0,
  entities: [{ id: ME, x, y: 100, facing: 'right', moving: !!you, location: 'outdoors' }],
  ...(you ? { you } : {}),
});
const me = () => ({ x: 0, y: 100, location: 'outdoors' as const, facing: 'down' as const });

/** Feed snapshots every 83 ms and render frames every 16 ms; returns the time control came back. */
function run(d: SelfDriver, drivenMs: number, totalMs: number): number | null {
  let x = 0;
  let released: number | null = null;
  let nextSnap = 0;
  for (now = 0; now <= totalMs; now += 16) {
    if (now >= nextSnap) {
      const driving = now < drivenMs;
      if (driving) x += 6;
      d.onSnapshot(snap(x, driving ? { mode: 'auto', goal: 'home' } : undefined), ME);
      nextSnap += 83;
    }
    const p = d.pose(me());
    if (p === null && now > 0 && released === null && now >= drivenMs) released = now;
  }
  return released;
}

describe('SelfDriver hand-back', () => {
  it('returns control within ~0.25 s after the server stops driving, with snapshots every 83 ms', () => {
    const d = new SelfDriver();
    const back = run(d, 2000, 5000);
    expect(back).not.toBeNull();
    expect(back!).toBeLessThanOrEqual(2000 + 83 + 110 + 32);
    expect(d.isActive()).toBe(false);
  });

  it('drives (non-null poses that move) while `you` is present, and stays released afterwards', () => {
    const d = new SelfDriver();
    const xs: number[] = [];
    let nextSnap = 0;
    let x = 0;
    for (now = 0; now <= 1500; now += 16) {
      if (now >= nextSnap) {
        x += 6;
        d.onSnapshot(snap(x, { mode: 'auto', goal: 'seat' }), ME);
        nextSnap += 83;
      }
      const p = d.pose(me());
      expect(p).not.toBeNull();
      xs.push(p!.x);
    }
    expect(xs.at(-1)!).toBeGreaterThan(xs[10]!);
    // server lets go; plain snapshots keep coming
    let released = false;
    for (; now <= 3000; now += 16) {
      if (now >= nextSnap) {
        d.onSnapshot(snap(x, undefined), ME);
        nextSnap += 83;
      }
      const p = d.pose(me());
      if (p === null) released = true;
      else expect(released, 'never re-captured after release').toBe(false);
    }
    expect(released).toBe(true);
  });

  it('frozen holds still at the server position; unfreezing releases', () => {
    const d = new SelfDriver();
    now = 0;
    d.onSnapshot(snap(50, { mode: 'frozen' }), ME);
    now = 50;
    expect(d.pose(me())).toMatchObject({ x: 50, moving: false });
    now = 100;
    d.onSnapshot(snap(50, undefined), ME);
    now = 400;
    d.onSnapshot(snap(50, undefined), ME);
    expect(d.pose(me())).toBeNull();
  });

  it('never captures a player the server never drove', () => {
    const d = new SelfDriver();
    for (now = 0; now < 1000; now += 83) {
      d.onSnapshot(snap(now / 10, undefined), ME);
      expect(d.pose(me())).toBeNull();
    }
  });
});
