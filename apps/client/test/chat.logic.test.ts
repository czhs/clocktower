// (v2.3 chat/ux) Chat panel helpers: "who reads me" scope, client rate-limit mirror + countdown,
// optimistic outbox (echo matching, refusals, timeouts, duplicates), log merge, unread, scroll pill.
import { describe, expect, it } from 'vitest';
import type { AnnouncementView, ChatMessage } from '@ct/protocol';
import {
  atBottom,
  buildLog,
  chatScope,
  countHere,
  expireOutbox,
  isRecentDuplicate,
  makeCid,
  matchEcho,
  mergeAnnouncements,
  nextPill,
  refuseOldest,
  secondsLeft,
  TokenBucket,
  unreadAfter,
  ECHO_TIMEOUT_MS,
  MAX_TRIES,
  type OutLine,
  type ScopeInput,
} from '../src/ui/chat/logic';
import { toastMs } from '../src/ui/hud/logic';

const names: Record<string, string> = { 'house-0': 'Stargazer’s Tower', 'house-3': 'Ravenscroft', tavern: 'The Tavern' };
const houses: Record<string, number> = { 'house-0': 0, 'house-3': 3 };
const base = (over: Partial<ScopeInput> = {}): ScopeInput => ({
  role: 'player',
  phase: null,
  location: 'outdoors',
  seat: null,
  here: 1,
  buildingName: (id) => names[id] ?? null,
  houseIndexOf: (id) => houses[id] ?? null,
  ownerOf: (hi) => (hi === 3 ? 'Ada' : null),
  ...over,
});

describe('chatScope', () => {
  it('outdoors = everyone outside, with the own count', () => {
    const s = chatScope(base({ here: 7 }));
    expect(s.kind).toBe('square');
    expect(s.title).toBe('Town square');
    expect(s.detail).toContain('everyone outside');
    expect(s.detail).toContain('7 outside');
    expect(s.tag).toBe('square');
    expect(chatScope(base({ here: 1 })).detail).toContain('just you');
  });

  it('inside a building = only that room, named, owner once seats are dealt', () => {
    const s = chatScope(base({ location: 'bld:house-3', here: 3, phase: 'day', seat: 0 }));
    expect(s.kind).toBe('room');
    expect(s.title).toBe('Inside Ravenscroft');
    expect(s.detail).toContain('Ada’s home');
    expect(s.detail).toContain('only this room');
    expect(s.detail).toContain('3 here');
    expect(s.tag).toBe('in Ravenscroft');
    expect(s.key).toBe('bld:house-3');
    expect(chatScope(base({ location: 'bld:tavern' })).title).toBe('Inside The Tavern');
  });

  it('players at night: their own home, whatever the location says', () => {
    const own = chatScope(base({ phase: 'night', seat: 0, location: 'bld:house-0', here: 2 }));
    expect(own.kind).toBe('home');
    expect(own.title).toContain('Your home');
    expect(own.detail).toContain('2 here');
    const glitch = chatScope(base({ phase: 'first_night', seat: 0, location: 'outdoors' }));
    expect(glitch.kind).toBe('home');
    expect(glitch.key).toBe('home:0');
  });

  it('the Storyteller outdoors at night reaches nobody; indoors the visited room', () => {
    expect(chatScope(base({ role: 'storyteller', phase: 'night' })).kind).toBe('nobody');
    const visit = chatScope(base({ role: 'storyteller', phase: 'night', location: 'bld:house-3', here: 2 }));
    expect(visit.kind).toBe('room');
    expect(visit.detail).toContain('as the Storyteller');
  });

  it('unknown location falls back to "nearby"', () => {
    expect(chatScope(base({ location: null })).kind).toBe('unknown');
  });

  it('day and waiting room use the same wording', () => {
    expect(chatScope(base({ phase: 'day' })).title).toBe(chatScope(base({ phase: null })).title);
  });
});

describe('countHere', () => {
  const ents = [
    { id: 'me', location: 'bld:house-3' as const },
    { id: 'a', location: 'bld:house-3' as const },
    { id: 'b', location: 'outdoors' as const },
    { id: 'npc', location: 'bld:house-3' as const },
  ];
  it('counts only members in the own location', () => {
    expect(countHere(ents, 'bld:house-3', (p) => p !== 'npc')).toBe(2);
    expect(countHere(ents, 'outdoors', () => true)).toBe(1);
    expect(countHere([], null, () => true)).toBe(1);
  });
});

describe('TokenBucket + countdown', () => {
  it('mirrors the server bucket: burst 4, then 2 per second', () => {
    const b = new TokenBucket(4, 2, 0);
    for (let i = 0; i < 4; i++) expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(false);
    expect(b.waitMs(0)).toBe(500);
    expect(b.take(499)).toBe(false);
    expect(b.take(500)).toBe(true);
    expect(b.waitMs(500)).toBe(500);
  });
  it('drain() empties it after a server refusal', () => {
    const b = new TokenBucket(4, 2, 0);
    b.drain(0);
    expect(b.take(0)).toBe(false);
    expect(b.waitMs(0)).toBe(500);
  });
  it('secondsLeft rounds up and never goes negative', () => {
    expect(secondsLeft(2000, 0)).toBe(2);
    expect(secondsLeft(2000, 1001)).toBe(1);
    expect(secondsLeft(2000, 1999)).toBe(1);
    expect(secondsLeft(2000, 2500)).toBe(0);
  });
});

const line = (over: Partial<OutLine>): OutLine => ({ cid: 'x', text: 'hi', state: 'sending', at: 0, sentAt: 0, tries: 1, zoneKey: 'outdoors', zoneTag: 'square', ...over });

describe('outbox', () => {
  it('echo confirms the oldest sending line with the same text, else the oldest sending', () => {
    const out = [line({ cid: 'q', state: 'queued', text: 'hello' }), line({ cid: 'a', text: 'first' }), line({ cid: 'b', text: 'Hello  there' })];
    expect(matchEcho(out, 'hello there')).toBe(2);
    expect(matchEcho(out, 'masked ****')).toBe(1);
    expect(matchEcho([line({ state: 'queued' })], 'hi')).toBe(-1);
  });

  it('echo with a cid confirms exactly that line (even one that already failed)', () => {
    const out = [line({ cid: 'a', text: 'same' }), line({ cid: 'b', text: 'same' }), line({ cid: 'f', text: 'late', state: 'failed' })];
    expect(matchEcho(out, 'same', 'b')).toBe(1);
    expect(matchEcho(out, 'late', 'f')).toBe(2);
    expect(matchEcho(out, 'same', 'unknown')).toBe(0); // falls back to text matching
  });

  it('makeCid fits ChatSendMsg.cid', () => {
    for (const r of [0, 0.5, 0.999999]) expect(makeCid(Date.now(), () => r)).toMatch(/^[A-Za-z0-9_-]{1,16}$/);
  });

  it('unechoed lines time out to failed', () => {
    const out = [line({ cid: 'a', sentAt: 0 }), line({ cid: 'b', sentAt: 5000 })];
    expect(expireOutbox(out, ECHO_TIMEOUT_MS - 1)).toBeNull();
    const next = expireOutbox(out, ECHO_TIMEOUT_MS + 1)!;
    expect(next[0]!.state).toBe('failed');
    expect(next[1]!.state).toBe('sending');
  });

  it('rate_limited requeues with a back-off until MAX_TRIES; other refusals fail', () => {
    const out = [line({ cid: 'a', tries: 1 })];
    const r = refuseOldest(out, 'rate_limited', 'Slow down', 100);
    expect(r[0]!.state).toBe('queued');
    expect(r[0]!.notBefore).toBeGreaterThan(100);
    const spent = refuseOldest([line({ tries: MAX_TRIES })], 'rate_limited', 'Slow down', 0);
    expect(spent[0]!.state).toBe('failed');
    const bad = refuseOldest(out, 'invalid', 'Invalid message payload', 0);
    expect(bad[0]).toMatchObject({ state: 'failed', reason: 'Invalid message payload' });
  });

  it('duplicates: same line within 5 s (server window, v2.3), or one still pending', () => {
    expect(isRecentDuplicate('Hello', { text: 'hello', at: 0 }, 4000)).toBe(true);
    expect(isRecentDuplicate('Hello', { text: 'hello', at: 0 }, 6000)).toBe(false);
    expect(isRecentDuplicate('other', { text: 'hello', at: 0 }, 1000)).toBe(false);
    expect(isRecentDuplicate('again', null, 0, [line({ text: 'again', state: 'queued' })])).toBe(true);
    expect(isRecentDuplicate('again', null, 0, [line({ text: 'again', state: 'failed' })])).toBe(false);
  });
});

const msg = (id: string, at: number, fromPid: string | null = 'p1'): ChatMessage => ({ id, at, fromPid, fromName: 'X', text: id, scope: 'zone' });
const ann = (id: string, at: number): AnnouncementView => ({ id, at, kind: 'phase', text: id });

describe('log', () => {
  it('merges announcement lists by id+time (ids restart every game), oldest first, capped', () => {
    const merged = mergeAnnouncements([[ann('a1', 10), ann('a2', 20)], [ann('a2', 20), ann('a1', 500), ann('abort-3', 30)]], 3);
    expect(merged.map((a) => `${a.id}@${a.at}`)).toEqual(['a2@20', 'abort-3@30', 'a1@500']);
  });
  it('interleaves chat and crier lines by time', () => {
    const log = buildLog([msg('m1', 5), msg('m2', 25)], [ann('a1', 10)], true);
    expect(log.map((i) => i.key)).toEqual(['c:m1', 'a:a1@10', 'c:m2']);
    expect(buildLog([msg('m1', 5)], [ann('a1', 10)], false)).toHaveLength(1);
  });
  it('unread counts other people after the last seen id, even with a capped list', () => {
    const chat = [msg('m1', 1), msg('m2', 2, 'me'), msg('m3', 3), msg('m4', 4)];
    expect(unreadAfter(chat, 'm1', 'me')).toBe(2);
    expect(unreadAfter(chat, 'm4', 'me')).toBe(0);
    expect(unreadAfter(chat, 'gone', 'me')).toBe(3); // seen line scrolled out of the 200 cap
    expect(unreadAfter(chat, null, 'me')).toBe(3);
  });
});

describe('scroll pill', () => {
  it('at bottom within slack', () => {
    expect(atBottom({ scrollTop: 476, clientHeight: 100, scrollHeight: 600 })).toBe(true);
    expect(atBottom({ scrollTop: 300, clientHeight: 100, scrollHeight: 600 })).toBe(false);
  });
  it('counts only while scrolled up; own lines and reaching the bottom clear it', () => {
    expect(nextPill(0, 2, false, false)).toBe(2);
    expect(nextPill(2, 1, false, false)).toBe(3);
    expect(nextPill(3, 1, true, false)).toBe(0);
    expect(nextPill(3, 1, false, true)).toBe(0);
  });
});

describe('toastMs', () => {
  it('gives long announcements reading time, within bounds', () => {
    expect(toastMs('error', 'x')).toBe(9000);
    expect(toastMs('phase', 'Night 2 falls.')).toBe(6000);
    expect(toastMs('storyteller', 'x'.repeat(150))).toBe(12_500);
    expect(toastMs('storyteller', 'x'.repeat(300))).toBe(14_000);
  });
});
