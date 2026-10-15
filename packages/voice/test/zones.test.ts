import { describe, expect, it } from 'vitest';
import type { GamePhase } from '@ct/protocol';
import { computeZones, ZoneTracker, type ZoneMemberInput } from '../src/index.js';
import { inside, layout, TS } from './layout.js';

const sq = layout.square;
const out = (pid: string, x: number, y: number, extra: Partial<ZoneMemberInput> = {}): ZoneMemberInput => ({
  pid,
  role: 'player',
  location: 'outdoors',
  x,
  y,
  ...extra,
});
const at = (pid: string, id: string, extra: Partial<ZoneMemberInput> = {}): ZoneMemberInput => ({ pid, role: 'player', ...inside(id), ...extra });

describe('computeZones — day rules', () => {
  it('v2: outdoors ANYWHERE -> the square broadcast (no street proximity); interior -> private bld room', () => {
    const tb = layout.townBounds;
    const z = computeZones({
      phase: 'day',
      layout,
      members: [
        out('a', sq.cx, sq.cy),
        out('b', sq.cx + sq.r - 1, sq.cy),
        out('c', sq.cx + sq.r + 2, sq.cy),
        out('far', (tb.x + 1) * TS, (tb.y + tb.h - 1) * TS), // the far corner of town
        at('d', 'house-3'),
        at('e', 'house-1'),
      ],
    });
    for (const pid of ['a', 'b', 'c', 'far']) expect(z.get(pid)).toEqual({ zone: 'square', mode: 'broadcast' });
    expect(z.get('d')).toEqual({ zone: 'bld:house-3', mode: 'private' });
    expect(z.get('e')).toEqual({ zone: 'bld:house-1', mode: 'private' });
    expect([...z.values()].some((v) => v.zone === 'street')).toBe(false);
  });

  it('members without a position / unknown building get no room', () => {
    const z = computeZones({
      phase: null,
      layout,
      members: [
        { pid: 'a', role: 'player', location: null, x: null, y: null },
        { pid: 'b', role: 'player', location: 'bld:nowhere', x: 0, y: 0 },
      ],
    });
    expect(z.get('a')).toEqual({ zone: 'none', mode: null });
    expect(z.get('b')).toEqual({ zone: 'none', mode: null });
  });

  it.each<GamePhase | null>([null, 'setup', 'day', 'bedtime', 'finished'])('phase %s uses the normal rules', (phase) => {
    const z = computeZones({ phase, layout, members: [out('a', sq.cx, sq.cy, { seat: 0 }), at('b', 'house-3', { seat: 1 })] });
    expect(z.get('a')!.zone).toBe('square');
    expect(z.get('b')!.zone).toBe('bld:house-3');
  });
});

describe('computeZones — night isolation and visits', () => {
  it.each<GamePhase>(['first_night', 'night', 'dawn'])('%s: every player is in their own home regardless of position', (phase) => {
    const z = computeZones({
      phase,
      layout,
      members: [out('p0', sq.cx, sq.cy, { seat: 0 }), at('p1', 'house-3', { seat: 1 }), at('p2', 'house-0', { seat: 2 })],
    });
    expect(z.get('p0')!.zone).toBe('bld:house-0');
    expect(z.get('p1')!.zone).toBe('bld:house-1');
    expect(z.get('p2')!.zone).toBe('bld:house-2');
    for (const v of z.values()) expect(v.mode).toBe('private');
  });

  it('night: storyteller outdoors has no room; inside a home shares only that home', () => {
    const base = [at('p0', 'house-0', { seat: 0 }), at('p1', 'house-1', { seat: 1 })];
    const outside = computeZones({ phase: 'night', layout, members: [...base, out('st', sq.cx, sq.cy, { role: 'storyteller' })] });
    expect(outside.get('st')!.zone).toBe('none');
    const visit = computeZones({ phase: 'night', layout, members: [...base, at('st', 'house-1', { role: 'storyteller' })] });
    expect(visit.get('st')!.zone).toBe('bld:house-1');
    expect(visit.get('p1')!.zone).toBe('bld:house-1');
    expect(visit.get('p0')!.zone).toBe('bld:house-0');
  });

  it('day: storyteller follows the normal rules', () => {
    const z = computeZones({ phase: 'day', layout, members: [out('st', sq.cx, sq.cy, { role: 'storyteller' })] });
    expect(z.get('st')!.zone).toBe('square');
  });
});

describe('ZoneTracker (v2: outdoors is one zone, so nothing to debounce outdoors)', () => {
  const input = (x: number, y: number = sq.cy, phase: GamePhase | null = 'day') => ({ phase, layout, members: [out('a', x, y)] });

  it('walking anywhere outdoors never changes the zone (no square/street boundary, no flapping)', () => {
    const t = new ZoneTracker({ squareMarginPx: 24, debounceMs: 600 });
    expect(t.update(input(sq.cx), 0)).toEqual([{ pid: 'a', from: null, to: 'square', mode: 'broadcast' }]);
    let changes = 0;
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % (layout.townBounds.w * TS);
      const y = (i * 53) % (layout.townBounds.h * TS);
      changes += t.update(input(x, y), 100 + i * 50).length;
    }
    expect(changes).toBe(0);
    expect(t.zoneOf('a')).toBe('square');
  });

  it('private-zone transitions are immediate (no lingering in a building room)', () => {
    const t = new ZoneTracker({ debounceMs: 10_000 });
    t.update({ phase: 'day', layout, members: [at('a', 'house-3')] }, 0);
    expect(t.update(input(sq.cx + sq.r + 5 * TS), 1)).toEqual([{ pid: 'a', from: 'bld:house-3', to: 'square', mode: 'broadcast' }]);
    expect(t.update(input(sq.cx), 2)).toEqual([]);
    expect(t.update({ phase: 'day', layout, members: [at('a', 'house-1')] }, 3)).toEqual([{ pid: 'a', from: 'square', to: 'bld:house-1', mode: 'private' }]);
    expect(t.update({ phase: 'night', layout, members: [out('a', sq.cx, sq.cy, { seat: 2 })] }, 4)[0]!.to).toBe('bld:house-2');
  });

  it('reports removed members', () => {
    const t = new ZoneTracker();
    t.update(input(sq.cx), 0);
    expect(t.update({ phase: 'day', layout, members: [] }, 1)).toEqual([{ pid: 'a', from: 'square', to: null, mode: null }]);
  });
});
