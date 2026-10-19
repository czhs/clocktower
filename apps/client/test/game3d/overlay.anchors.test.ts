// v3 WP4: anchor stacking of the world-anchored overlays (game3d/overlay/anchors.ts): label over the head
// top, talk glyph beside it, pins / bubbles above it, bubble stacking + clamping, headings, edge markers.
import { describe, expect, it } from 'vitest';
import type { BubbleBox } from '../../src/game/social/speech';
import { edgePoint, glyphAt, headingOf, HEADINGS, inRect, labelBox, layoutBubbles, personPinTip, stackBase, type BubbleIn, type BubbleOut } from '../../src/game3d/overlay/anchors';

const px = 3;

describe('label / glyph / stack base', () => {
  it('centres the label on the head, its bottom 1 texel above the head top', () => {
    const head = { x: 200, y: 120 };
    const box = labelBox(head, { w: 40, h: 14 }, px);
    expect(box).toEqual({ x: 180, y: 120 - 3 - 14, w: 40, h: 14 });
  });

  it('puts the talk glyph 1 texel right of the label, top 1 texel above it', () => {
    const head = { x: 200, y: 120 };
    const box = labelBox(head, { w: 40, h: 14 }, px);
    expect(glyphAt(box, head, px, { w: 27, h: 27 })).toEqual({ x: 180 + 40 + 3, y: box.y - 3 });
    // no label: beside the head, above it
    expect(glyphAt(null, head, px, { w: 27, h: 27 })).toEqual({ x: 212, y: 120 - 3 - 27 });
  });

  it('stacks pins and bubbles on a base 1 texel above the label (or the head)', () => {
    const head = { x: 50, y: 80 };
    const box = labelBox(head, { w: 30, h: 12 }, px);
    const base = stackBase(box, head, px);
    expect(base).toEqual({ x: 50, y: box.y - 3 });
    expect(base.y).toBeLessThan(box.y); // above the label: never covers the name
    expect(stackBase(null, head, px)).toEqual({ x: 50, y: 77 });
    expect(personPinTip(base, { dx: -6, dy: 1.5 }, -3)).toEqual({ x: 44, y: base.y + 1.5 - 3 });
  });

  it('inRect with slack', () => {
    const r = { x: 10, y: 10, w: 20, h: 10 };
    expect(inRect({ x: 10, y: 10 }, r)).toBe(true);
    expect(inRect({ x: 31, y: 15 }, r)).toBe(false);
    expect(inRect({ x: 31, y: 15 }, r, 2)).toBe(true);
  });
});

describe('bubble stacking', () => {
  const run = (items: BubbleIn[], viewW = 1000) => {
    const boxes: BubbleBox[] = [];
    const out: BubbleOut[] = [];
    layoutBubbles(items, items.length, viewW, px, boxes, out);
    return out;
  };

  it('a lone bubble sits with its tail tip on the base point, tail under the speaker', () => {
    const [o] = run([{ x: 300, y: 200, w: 90, h: 45, tail: 9 }]);
    expect(o).toEqual({ left: 255, top: 155, lifted: false, tailX: 45 });
  });

  it('a newer bubble that would cover an older one climbs above it (2-texel gap) and drops its tail', () => {
    const out = run([
      { x: 300, y: 200, w: 90, h: 45, tail: 9 },
      { x: 320, y: 205, w: 90, h: 45, tail: 9 },
    ]);
    const [older, newer] = out as [BubbleOut, BubbleOut];
    expect(older.lifted).toBe(false);
    expect(newer.lifted).toBe(true);
    expect(newer.tailX).toBe(-1);
    expect(newer.top + 45).toBeLessThanOrEqual(older.top - 2 * px + 0.5);
  });

  it('bubbles far apart do not move', () => {
    const out = run([
      { x: 100, y: 200, w: 90, h: 45, tail: 9 },
      { x: 400, y: 200, w: 90, h: 45, tail: 9 },
    ]);
    expect(out.map((o) => o.lifted)).toEqual([false, false]);
    expect(out[1]!.top).toBe(out[0]!.top);
  });

  it('three overlapping bubbles form a column, newest on top', () => {
    const out = run([
      { x: 300, y: 300, w: 60, h: 30, tail: 9 },
      { x: 305, y: 300, w: 60, h: 30, tail: 9 },
      { x: 295, y: 300, w: 60, h: 30, tail: 9 },
    ]);
    expect(out[0]!.top).toBeGreaterThan(out[1]!.top);
    expect(out[1]!.top).toBeGreaterThan(out[2]!.top);
  });

  it('clamps into the view; the tail still points at the speaker inside the box', () => {
    const [left] = run([{ x: 10, y: 200, w: 90, h: 45, tail: 9 }], 390);
    expect(left!.left).toBe(3); // 1 texel in from the edge
    expect(left!.tailX).toBe(9); // = 3 texels: never in the rounded corner
    const [right] = run([{ x: 385, y: 200, w: 90, h: 45, tail: 9 }], 390);
    expect(right!.left + 90).toBeLessThanOrEqual(390);
    expect(right!.tailX).toBe(90 - 9);
  });

  it('reuses its arrays (no allocations once warm)', () => {
    const boxes: BubbleBox[] = [];
    const out: BubbleOut[] = [];
    const items = [{ x: 300, y: 200, w: 90, h: 45, tail: 9 }];
    layoutBubbles(items, 1, 1000, px, boxes, out);
    const o0 = out[0];
    const b0 = boxes[0];
    layoutBubbles(items, 1, 1000, px, boxes, out);
    expect(out[0]).toBe(o0);
    expect(boxes[0]).toBe(b0);
  });
});

describe('headings and edge markers', () => {
  it('maps screen directions (y down) to the 8 atlas headings', () => {
    expect(headingOf(1, 0)).toBe('right');
    expect(headingOf(1, 1)).toBe('down-right');
    expect(headingOf(0, 1)).toBe('down');
    expect(headingOf(-1, 1)).toBe('down-left');
    expect(headingOf(-1, 0)).toBe('left');
    expect(headingOf(-1, -1)).toBe('up-left');
    expect(headingOf(0, -1)).toBe('up');
    expect(headingOf(1, -1)).toBe('up-right');
    expect(headingOf(-1, -0.0001)).toBe('left');
    expect(new Set(HEADINGS).size).toBe(8);
  });

  it('places an off-screen target on the inset view edge, along the ray from the centre', () => {
    expect(edgePoint({ x: 400, y: 300 }, 800, 600, 20)).toBeNull();
    expect(edgePoint({ x: 1600, y: 300 }, 800, 600, 20)).toEqual({ x: 780, y: 300 });
    expect(edgePoint({ x: 400, y: -900 }, 800, 600, 20)).toEqual({ x: 400, y: 20 });
    const p = edgePoint({ x: 2000, y: 2000 }, 800, 600, 20)!;
    expect(p.y).toBeCloseTo(580);
    expect(p.x).toBeGreaterThan(400);
    expect(p.x).toBeLessThanOrEqual(780);
  });
});
