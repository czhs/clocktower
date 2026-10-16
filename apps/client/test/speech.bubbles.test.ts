// v2.2 chat speech bubbles: pure logic (apps/client/src/game/social/speech.ts).
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@ct/protocol';
import { bubbleAlpha, bubbleDurationMs, bubbleScope, bubbleText, SPEECH, SpeechBook, stackBubbles, wrapLines, type BubbleBox } from '../src/game/social/speech';

const msg = (fromPid: string | null, text: string, scope: ChatMessage['scope'] = 'zone', id = Math.random().toString(36).slice(2)): ChatMessage => ({ id, fromPid, fromName: fromPid ?? 'System', text, scope, at: 0 });
const all = () => true;

describe('scoping', () => {
  it('only lobby / zone messages from a player bubble', () => {
    expect(bubbleScope(msg('a', 'hi', 'lobby'))).toBe(true);
    expect(bubbleScope(msg('a', 'hi', 'zone'))).toBe(true);
    expect(bubbleScope(msg('st', 'hi', 'storyteller'))).toBe(false);
    expect(bubbleScope(msg(null, 'hi', 'system'))).toBe(false);
    expect(bubbleScope(msg(null, 'hi', 'zone'))).toBe(false);
    expect(bubbleScope(msg('', 'hi', 'zone'))).toBe(false);
  });

  it('never bubbles for a sender whose avatar is not drawn (no avatar is created or revealed)', () => {
    const book = new SpeechBook();
    const seen = new Set(['me', 'b']);
    expect(book.add(msg('hidden', 'psst'), 0, (p) => seen.has(p))).toBeNull();
    expect(book.add(msg('b', 'hello'), 0, (p) => seen.has(p))?.pid).toBe('b');
    expect(book.add(msg('me', 'my own line'), 0, (p) => seen.has(p))?.pid).toBe('me');
    expect(book.add(msg('st', 'night falls', 'storyteller'), 0, all)).toBeNull();
    expect(book.add(msg(null, 'Alice joined', 'system'), 0, all)).toBeNull();
    expect(book.list.map((b) => b.pid)).toEqual(['b', 'me']);
  });

  it('drops a bubble when its avatar stops being drawn (left the place)', () => {
    const book = new SpeechBook();
    book.add(msg('a', 'x'), 0, all);
    book.add(msg('b', 'y'), 0, all);
    expect(book.prune(100, (p) => p !== 'a')).toBe(1);
    expect(book.list[0]!.pid).toBe('b');
  });

  it('ignores blank messages', () => {
    expect(new SpeechBook().add(msg('a', '   \n\t '), 0, all)).toBeNull();
  });
});

describe('replacement, cap and expiry', () => {
  it('a newer message from the same person replaces their bubble', () => {
    const book = new SpeechBook();
    const first = book.add(msg('a', 'first', 'zone', 'm1'), 0, all)!;
    book.add(msg('b', 'other'), 10, all);
    const second = book.add(msg('a', 'second', 'zone', 'm2'), 1000, all)!;
    expect(book.list.length).toBe(2);
    expect(second).toBe(first); // same slot object, redrawn
    expect(second.id).toBe('m2');
    expect(second.text).toBe('second');
    expect(second.born).toBe(1000);
    expect(second.rev).toBeGreaterThan(1);
    expect(book.list.map((b) => b.pid)).toEqual(['b', 'a']); // newest last (drawn on top)
  });

  it('caps how many show at once; the oldest give way', () => {
    const book = new SpeechBook();
    for (let i = 0; i < 8; i++) book.add(msg(`p${i}`, 'hi'), i, all);
    expect(book.list.map((b) => b.pid)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(SPEECH.maxBubbles).toBe(6);
    book.trim(SPEECH.maxBubblesLow);
    expect(book.list.map((b) => b.pid)).toEqual(['p4', 'p5', 'p6', 'p7']);
    book.add(msg('q', 'hi'), 9, all, SPEECH.maxBubblesLow);
    expect(book.list.length).toBe(4);
  });

  it('your own bubble never gives way to newer ones', () => {
    const book = new SpeechBook();
    book.add(msg('me', 'mine'), 0, all, 3, 'me');
    for (let i = 0; i < 5; i++) book.add(msg(`p${i}`, 'hi'), i + 1, all, 3, 'me');
    expect(book.list.map((b) => b.pid)).toEqual(['me', 'p3', 'p4']);
  });

  it('expires after 5-7 s scaled with length, fading out at the end', () => {
    expect(bubbleDurationMs('ok')).toBe(5050);
    expect(bubbleDurationMs('')).toBe(SPEECH.minMs);
    expect(bubbleDurationMs('x'.repeat(80))).toBe(SPEECH.maxMs);
    expect(bubbleDurationMs('x'.repeat(500))).toBe(SPEECH.maxMs);
    const book = new SpeechBook();
    const b = book.add(msg('a', 'ok'), 0, all)!;
    expect(b.until).toBe(5050);
    expect(bubbleAlpha(b, 0)).toBe(0);
    expect(bubbleAlpha(b, 0, true)).toBe(1); // reduced motion: no fade in
    expect(bubbleAlpha(b, 1000)).toBe(1);
    expect(bubbleAlpha(b, 5050 - SPEECH.fadeOutMs / 2)).toBeCloseTo(0.5);
    expect(bubbleAlpha(b, 5050)).toBe(0);
    expect(book.prune(5049, all)).toBe(1);
    expect(book.prune(5050, all)).toBe(0);
  });
});

describe('text', () => {
  it('truncates at ~80 chars with an ellipsis, collapsing whitespace and controls', () => {
    const long = 'word '.repeat(40);
    const t = bubbleText(long);
    expect(Array.from(t).length).toBeLessThanOrEqual(SPEECH.maxChars);
    expect(t.endsWith('…')).toBe(true);
    expect(bubbleText('  a \n\n b\t c  ')).toBe('a b c');
    expect(bubbleText('a‮b\u0000c')).toBe('a b c');
    expect(bubbleText('short')).toBe('short');
    // never splits an emoji surrogate pair
    const e = bubbleText('😀'.repeat(100));
    expect(Array.from(e).length).toBe(SPEECH.maxChars);
    expect(e.endsWith('😀…')).toBe(true);
  });

  it('keeps markup as literal text (rendered via Phaser Text, never HTML)', () => {
    expect(bubbleText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });

  it('wraps to a few lines, breaking over-long words', () => {
    expect(wrapLines('the quick brown fox jumps over the lazy dog', 12)).toEqual(['the quick', 'brown fox', 'jumps over', 'the lazy dog']);
    expect(wrapLines('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 12)).toEqual(['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaa']);
    const many = wrapLines('one two three four five six seven eight nine ten', 6, 3);
    expect(many.length).toBe(3);
    expect(many[2]!.endsWith('…')).toBe(true);
    for (const l of wrapLines(bubbleText('lorem ipsum dolor sit amet '.repeat(10)))) expect(Array.from(l).length).toBeLessThanOrEqual(SPEECH.lineChars);
    expect(wrapLines(bubbleText('lorem ipsum dolor sit amet '.repeat(10))).length).toBeLessThanOrEqual(SPEECH.maxLines);
  });

  it('stores the wrapped text on the bubble', () => {
    const b = new SpeechBook().add(msg('a', 'the quick brown fox jumps over the lazy dog again and again'), 0, all)!;
    expect(b.text.split('\n').length).toBeGreaterThan(1);
  });
});

describe('stacking', () => {
  const box = (x: number, y: number, w = 40, h = 12): BubbleBox => ({ x, y, w, h, lift: 0 });

  it('leaves separate bubbles alone', () => {
    const b = [box(0, 100), box(100, 100)];
    stackBubbles(b);
    expect(b.map((x) => x.lift)).toEqual([0, 0]);
  });

  it('raises a newer bubble above an older one it would cover', () => {
    const b = [box(0, 100), box(10, 104)];
    stackBubbles(b, 2, 1);
    expect(b[0]!.lift).toBe(0);
    // newer box bottom (104 - lift) sits at/above the older top (88) minus the gap
    expect(104 - b[1]!.lift).toBeLessThanOrEqual(100 - 12 - 1);
  });

  it('climbs over a whole pile, and respects the lift cap', () => {
    const b = [box(0, 100), box(5, 100), box(-5, 100)];
    stackBubbles(b, 3, 1);
    const spans = b.map((x) => [x.y - x.lift - x.h, x.y - x.lift] as const);
    for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) expect(spans[i]![1] <= spans[j]![0] || spans[i]![0] >= spans[j]![1]).toBe(true);
    const c = [box(0, 100), box(0, 100), box(0, 100)];
    stackBubbles(c, 3, 1, 15);
    expect(Math.max(...c.map((x) => x.lift))).toBeLessThanOrEqual(15);
  });

  it('only considers the first n boxes', () => {
    const b = [box(0, 100), box(0, 100)];
    b[1]!.lift = 7;
    stackBubbles(b, 1);
    expect(b[1]!.lift).toBe(7);
  });
});
