// OWNED BY voice. Big-room voice helpers: speaking hang-time debounce, panel ordering/overflow,
// room count label, auto-mute decision, and the pure bits of the in-town talking indicator.
import { describe, expect, it } from 'vitest';
import { CROWD_SIZE, crowdLayout, noteActivity, roomCountLabel, shouldAutoMute, SpeakingHold, type Activity } from '../src/voice/speaking';
import { outlineCrop, outlineDepth, outlineMask, pulseStep } from '../src/game/fx/talking';
import { parseTalkOutlineMode } from '../src/game/fx/talkingPref';

describe('SpeakingHold (hang time)', () => {
  it('keeps a speaker on through short gaps and drops them after the hang time', () => {
    const h = new SpeakingHold(300);
    expect([...h.update(['a'], 0)]).toEqual(['a']);
    expect(h.update([], 100).has('a')).toBe(true);
    expect(h.update([], 250).has('a')).toBe(true);
    expect(h.update(['a'], 280).has('a')).toBe(true); // spoke again: hang restarts
    expect(h.update([], 570).has('a')).toBe(true);
    expect(h.update([], 580).has('a')).toBe(false);
  });

  it('returns the same Set object while nothing changes (change-only patches)', () => {
    const h = new SpeakingHold(300);
    const s1 = h.update(['a', 'b'], 0);
    const s2 = h.update(['a'], 50);
    const s3 = h.update(['b'], 100);
    expect(s2).toBe(s1);
    expect(s3).toBe(s1);
    const s4 = h.update(['c'], 120);
    expect(s4).not.toBe(s1);
    expect([...s4].sort()).toEqual(['a', 'b', 'c']);
  });

  it('flickering raw input (on/off every 100 ms) gives one steady "speaking"', () => {
    const h = new SpeakingHold(300);
    let changes = 0;
    let prev = h.update([], 0);
    for (let t = 0; t <= 2000; t += 50) {
      const cur = h.update(Math.floor(t / 100) % 2 === 0 ? ['a'] : [], t);
      if (cur !== prev) changes++;
      prev = cur;
    }
    expect(changes).toBe(1);
    expect(prev.has('a')).toBe(true);
  });

  it('drop and clear', () => {
    const h = new SpeakingHold(300);
    h.update(['a', 'b'], 0);
    h.drop('a');
    expect([...h.update([], 10)]).toEqual(['b']);
    h.clear();
    expect(h.update([], 20).size).toBe(0);
  });
});

const P = (pid: string, speaking = false) => ({ pid, speaking });

describe('crowd ordering / overflow', () => {
  it('talkers first in the order they started, then most recent speakers, then input order', () => {
    const act = new Map<string, Activity>();
    const people = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((p) => P(p));
    noteActivity(act, people, 0);
    // f speaks at 10..20, c at 30..40, then g starts at 50 and b at 60
    noteActivity(act, people.map((p) => P(p.pid, p.pid === 'f')), 10);
    noteActivity(act, people, 20);
    noteActivity(act, people.map((p) => P(p.pid, p.pid === 'c')), 30);
    noteActivity(act, people, 40);
    noteActivity(act, people.map((p) => P(p.pid, p.pid === 'g')), 50);
    const now = people.map((p) => P(p.pid, p.pid === 'g' || p.pid === 'b'));
    noteActivity(act, now, 60);
    const l = crowdLayout(now, act, 5);
    expect(l.talking.map((p) => p.pid)).toEqual(['g', 'b']);
    expect(l.rows.map((p) => p.pid)).toEqual(['c', 'f', 'a']);
    expect(l.overflow.map((p) => p.pid)).toEqual(['d', 'e', 'h']);
  });

  it('more talkers than rows: every talker still gets a full row', () => {
    const act = new Map<string, Activity>();
    const people = Array.from({ length: 15 }, (_, i) => P(`p${i}`, i < 7));
    noteActivity(act, people, 0);
    const l = crowdLayout(people, act, 5);
    expect(l.talking).toHaveLength(7);
    expect(l.rows).toHaveLength(0);
    expect(l.overflow).toHaveLength(8);
  });

  it('small rooms have no overflow; leavers are forgotten', () => {
    const act = new Map<string, Activity>();
    noteActivity(act, [P('a', true), P('b')], 0);
    expect(crowdLayout([P('a', true), P('b')], act).overflow).toHaveLength(0);
    noteActivity(act, [P('b')], 10);
    expect(act.has('a')).toBe(false);
  });

  it('is stable: same input gives the same order', () => {
    const act = new Map<string, Activity>();
    const people = Array.from({ length: 10 }, (_, i) => P(`p${i}`));
    noteActivity(act, people, 0);
    const a = crowdLayout(people, act);
    const b = crowdLayout(people, act);
    expect([...a.rows, ...a.overflow].map((p) => p.pid)).toEqual([...b.rows, ...b.overflow].map((p) => p.pid));
    expect([...a.rows, ...a.overflow].map((p) => p.pid)).toEqual(people.map((p) => p.pid));
  });
});

describe('room count + auto-mute', () => {
  it('labels', () => {
    expect(roomCountLabel(1, 'square')).toBe('1 person in the square');
    expect(roomCountLabel(16, 'square')).toBe('16 people in the square');
    expect(roomCountLabel(3, 'street')).toBe('3 people on the streets');
    expect(roomCountLabel(2, 'bld:house-3')).toBe('2 people in this room');
  });

  it('auto-mutes only an open mic joining a crowd, once', () => {
    const base = { enabledPref: true, inputMode: 'open' as const, muted: false, count: CROWD_SIZE, decided: false };
    expect(shouldAutoMute(base)).toBe(true);
    expect(shouldAutoMute({ ...base, count: CROWD_SIZE - 1 })).toBe(false);
    expect(shouldAutoMute({ ...base, inputMode: 'ptt' })).toBe(false);
    expect(shouldAutoMute({ ...base, muted: true })).toBe(false);
    expect(shouldAutoMute({ ...base, decided: true })).toBe(false);
    expect(shouldAutoMute({ ...base, enabledPref: false })).toBe(false);
  });
});

describe('in-town talking indicator (pure parts)', () => {
  /** RGBA buffer from rows of '#' (solid) / '.' (transparent). */
  const rgba = (rows: string[]) => {
    const w = rows[0]!.length;
    const d = new Uint8ClampedArray(w * rows.length * 4);
    rows.forEach((r, y) => [...r].forEach((c, x) => (d[(y * w + x) * 4 + 3] = c === '#' ? 255 : 0)));
    return { d, w, h: rows.length };
  };
  const show = (m: Uint8Array, W: number) => Array.from({ length: m.length / W }, (_, y) => [...m.slice(y * W, y * W + W)].map((v) => (v ? 'o' : '.')).join(''));

  it('outline hugs the silhouette: 1 px, never on the sprite itself (8-neighbour)', () => {
    const { d, w, h } = rgba(['...', '.#.', '...']);
    expect(show(outlineMask(d, w, h), w + 2)).toEqual(['.....', '.ooo.', '.o.o.', '.ooo.', '.....']);
  });

  it('4-neighbour variant has no corners; the 1-px border catches edge pixels', () => {
    const { d, w, h } = rgba(['#']);
    expect(show(outlineMask(d, w, h, false), 3)).toEqual(['.o.', 'o.o', '.o.']);
    expect(show(outlineMask(d, w, h, true), 3)).toEqual(['ooo', 'o.o', 'ooo']);
  });

  it('translucent-ish pixels below the threshold are not silhouette', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 30]);
    expect([...outlineMask(d, 1, 1)].every((v) => v === 0)).toBe(true);
  });

  it('outline crop follows the nick-face head crop (no phantom head)', () => {
    // 32x40 frame cropped to rows 14..39: outline keeps rows 15..41 of the 34x42 outline frame
    expect(outlineCrop(0, 14, 32, 26, 32, 40)).toEqual([0, 15, 34, 27]);
    // full frame = full outline frame
    expect(outlineCrop(0, 0, 32, 40, 32, 40)).toEqual([0, 0, 34, 42]);
  });

  it('outline depth: behind buildings by default (y-sorted under its avatar), or on top', () => {
    expect(parseTalkOutlineMode(null)).toBe('behind');
    expect(parseTalkOutlineMode('junk')).toBe('behind');
    expect(parseTalkOutlineMode('top')).toBe('top');
    const spr = 10 + 300; // avatar at y = 300
    const behind = outlineDepth('behind', spr);
    expect(behind).toBeLessThan(spr);
    expect(behind).toBeGreaterThan(10 + 299.5); // still in front of anything further back
    expect(behind).toBeLessThan(10 + 320); // a building whose base is further south covers it
    expect(behind).toBeLessThan(5000); // under the lighting, like the avatar
    const top = outlineDepth('top', spr);
    expect(top).toBeGreaterThan(5000);
    expect(top).toBeLessThan(5200); // name labels stay above it
  });

  it('pulse steps: 4 hard steps on normal, frozen on low', () => {
    const steps = new Set<number>();
    for (let t = 0; t < 900; t += 50) steps.add(pulseStep(t, 'normal'));
    expect([...steps].sort()).toEqual([0, 1, 2, 3]);
    for (let t = 0; t < 900; t += 50) expect(pulseStep(t, 'low')).toBe(0);
  });
});
