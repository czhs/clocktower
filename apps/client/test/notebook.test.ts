// OWNED BY notebook. The notebook's pure model (reducer + serializer) and its autosave controller
// (fake connection + fake clock): debounce, one save in flight, acks, "newer copy" conflicts,
// keep-mine, offline/reconnect, rate-limit retry, new game, and the size limits.
import { describe, expect, it } from 'vitest';
import {
  NotebookData,
  NOTEBOOK_MAX_BYTES,
  NOTEBOOK_NOTE_MAX,
  NOTEBOOK_TEXT_MAX,
  notebookBytes,
  type NotebookDataMsg,
  type NotebookUnavailableMsg,
} from '@ct/protocol';
import { createStore } from '../src/net/store';
import { createNotebookController, SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS, type NotebookConn } from '../src/ui/notebook/controller';
import { applyEdit, clip, initialNotebook, nextSave, normalize, reduce, saveStatus, serialize, type NotebookState } from '../src/ui/notebook/model';

const msg = (over: Partial<NotebookDataMsg>): NotebookDataMsg => ({ matchId: 'm1', rev: 0, data: { text: '', seats: [] }, savedAt: null, cause: 'load', ...over });
const loaded = (over: Partial<NotebookDataMsg> = {}) => reduce(initialNotebook(), { type: 'server', msg: msg(over) });
const typed = (s: NotebookState, text: string) => reduce(s, { type: 'edit', edit: { kind: 'text', text } });
const send = (s: NotebookState) => {
  const save = nextSave(s, 0)!;
  return { s: reduce(s, { type: 'sent', rev: save.rev, json: save.json }), save };
};

describe('notebook serializer', () => {
  it('normalizes: seats sorted, one per seat, empty ones dropped, notes one-line and capped', () => {
    let d = applyEdit({ text: '', seats: [] }, { kind: 'note', seat: 4, note: 'line one\nline two\ttab' });
    d = applyEdit(d, { kind: 'mark', seat: 1, mark: 'trust' });
    d = applyEdit(d, { kind: 'guess', seat: 4, guess: 'imp' });
    d = applyEdit(d, { kind: 'note', seat: 9, note: 'x'.repeat(500) });
    expect(d.seats.map((s) => s.seat)).toEqual([1, 4, 9]);
    expect(d.seats[1]).toEqual({ seat: 4, note: 'line one line two tab', guess: 'imp' });
    expect(d.seats[2]!.note).toHaveLength(NOTEBOOK_NOTE_MAX);
    d = applyEdit(d, { kind: 'mark', seat: 1, mark: null }); // nothing left on seat 1
    d = applyEdit(d, { kind: 'note', seat: 9, note: '' });
    expect(d.seats.map((s) => s.seat)).toEqual([4]);
    expect(serialize(d)).toBe('{"text":"","seats":[{"seat":4,"note":"line one line two tab","guess":"imp"}]}');
    expect(NotebookData.safeParse(d).success).toBe(true);
  });

  it('never produces something the server schema would refuse (length and byte caps)', () => {
    const seats = Array.from({ length: 15 }, (_, seat) => ({ seat, note: '😀'.repeat(200), guess: 'scarlet_woman' as const, mark: 'distrust' as const }));
    const d = normalize({ text: '漢'.repeat(NOTEBOOK_TEXT_MAX + 50), seats });
    expect(d.text.length).toBeLessThanOrEqual(NOTEBOOK_TEXT_MAX);
    expect(notebookBytes(d)).toBeLessThanOrEqual(NOTEBOOK_MAX_BYTES);
    expect(NotebookData.safeParse(d).success).toBe(true);
    for (const s of d.seats) expect(s.note.length).toBeLessThanOrEqual(NOTEBOOK_NOTE_MAX);
    // No lone surrogate halves at a cut.
    expect(clip('a😀', 2)).toBe('a');
    expect(clip('ab', 5)).toBe('ab');
  });
});

describe('notebook reducer', () => {
  it('loads, edits and saves rev = base + 1 with one save in flight', () => {
    let s = loaded({ rev: 3, data: { text: 'old', seats: [] }, savedAt: 5 });
    expect(saveStatus(s, 0)).toBe('saved');
    expect(nextSave(s, 0)).toBeNull();
    s = typed(s, 'new');
    expect(saveStatus(s, 0)).toBe('unsaved');
    const first = send(s);
    expect(first.save).toMatchObject({ matchId: 'm1', rev: 4, data: { text: 'new', seats: [] } });
    s = typed(first.s, 'newer still');
    expect(nextSave(s, 0)).toBeNull(); // in flight
    expect(saveStatus(s, 0)).toBe('saving');
    s = reduce(s, { type: 'server', msg: msg({ rev: 4, cause: 'saved', data: { text: 'new', seats: [] }, savedAt: 9 }) });
    expect(s).toMatchObject({ base: 4, dirty: true, inflight: null, savedAt: 9 });
    expect(s.data.text).toBe('newer still'); // the ack never overwrites what you typed since
    expect(nextSave(s, 0)!.rev).toBe(5);
  });

  it('newer copy from another device wins; your local copy is kept aside for "keep mine"', () => {
    let s = typed(loaded({ rev: 2, data: { text: 'shared', seats: [] } }), 'my offline edits');
    const sent = send(s);
    s = reduce(sent.s, { type: 'server', msg: msg({ rev: 5, cause: 'newer', data: { text: 'from the laptop', seats: [] } }) });
    expect(s).toMatchObject({ base: 5, dirty: false, inflight: null, data: { text: 'from the laptop' } });
    expect(s.notice?.discarded.text).toBe('my offline edits');
    s = reduce(s, { type: 'keepMine' });
    expect(s).toMatchObject({ notice: null, dirty: true, data: { text: 'my offline edits' } });
    expect(nextSave(s, 0)!.rev).toBe(6);
    // Dismissing instead keeps the newer copy.
    const d = reduce(reduce(sent.s, { type: 'server', msg: msg({ rev: 5, cause: 'newer', data: { text: 'from the laptop', seats: [] } }) }), { type: 'dismissNotice' });
    expect(d).toMatchObject({ notice: null, dirty: false, data: { text: 'from the laptop' } });
  });

  it('a newer load while idle is adopted silently; an older/equal load never clobbers edits', () => {
    let s = loaded({ rev: 1, data: { text: 'a', seats: [] } });
    s = reduce(s, { type: 'server', msg: msg({ rev: 3, data: { text: 'from phone', seats: [] } }) });
    expect(s).toMatchObject({ base: 3, data: { text: 'from phone' }, notice: null });
    s = typed(s, 'typing here');
    s = reduce(s, { type: 'server', msg: msg({ rev: 3, data: { text: 'from phone', seats: [] } }) }); // reconnect push
    expect(s).toMatchObject({ dirty: true, data: { text: 'typing here' }, notice: null });
  });

  it('after a drop, our own save echoed back by the reload counts as saved (no false conflict)', () => {
    let s = typed(loaded({ rev: 1 }), 'saved just before the drop');
    const { s: inflight, save } = send(s);
    s = reduce(inflight, { type: 'online', online: false });
    expect(s.inflight).toBeNull();
    expect(saveStatus(s, 0)).toBe('offline');
    s = reduce(s, { type: 'online', online: true });
    s = reduce(s, { type: 'server', msg: msg({ rev: save.rev, data: save.data }) });
    expect(s).toMatchObject({ base: 2, dirty: false, notice: null, data: { text: 'saved just before the drop' } });
  });

  it('a different match id = a fresh notebook (new game); no_game closes it; edits need a game', () => {
    let s = typed(loaded({ rev: 4, data: { text: 'game one', seats: [] } }), 'unsaved game one');
    s = reduce(s, { type: 'server', msg: msg({ matchId: 'm2' }) });
    expect(s).toMatchObject({ matchId: 'm2', base: 0, dirty: false, data: { text: '', seats: [] }, notice: null });
    s = reduce(s, { type: 'unavailable', msg: { reason: 'no_game', retryInMs: null }, now: 0 });
    expect(s.matchId).toBeNull();
    expect(saveStatus(s, 0)).toBe('closed');
    expect(typed(s, 'nope')).toBe(s);
  });

  it('rate limited: keeps the edits and waits for the retry hint', () => {
    const { s: inflight } = send(typed(loaded(), 'x'));
    const s = reduce(inflight, { type: 'unavailable', msg: { reason: 'rate_limited', retryInMs: 2000 }, now: 100 });
    expect(s).toMatchObject({ inflight: null, dirty: true, retryAt: 2100 });
    expect(nextSave(s, 2000)).toBeNull();
    expect(saveStatus(s, 2000)).toBe('retrying');
    expect(nextSave(s, 2100)!.rev).toBe(1);
  });
});

// ------------------------------------------------------------------------------- controller

function fakeConn() {
  const subs = new Map<string, Set<(p: any) => void>>();
  const sent: { type: string; payload: any }[] = [];
  const status = createStore<'connecting' | 'open' | 'reconnecting' | 'closed'>('open');
  const conn: NotebookConn = {
    events: {
      on: ((type: string, fn: (p: any) => void) => {
        if (!subs.has(type)) subs.set(type, new Set());
        subs.get(type)!.add(fn);
        return () => subs.get(type)!.delete(fn);
      }) as NotebookConn['events']['on'],
    },
    status,
    send: (type, payload) => void sent.push({ type, payload }),
  };
  const emit = (type: 'notebook:data' | 'notebook:unavailable', p: NotebookDataMsg | NotebookUnavailableMsg) => subs.get(type)?.forEach((f) => f(p));
  return { conn, sent, status, emit };
}

function fakeTimers() {
  let t = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => (pending.set(++seq, { at: t + ms, fn }), seq),
    clearTimeout: (id: unknown) => void pending.delete(id as number),
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = [...pending.entries()].filter(([, p]) => p.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

describe('notebook controller (autosave)', () => {
  it('debounces typing, caps the wait, keeps one save in flight and resumes after the ack', () => {
    const { conn, sent, emit } = fakeConn();
    const timers = fakeTimers();
    const ctl = createNotebookController(conn, timers);
    ctl.load();
    expect(sent).toEqual([{ type: 'notebook:load', payload: {} }]);
    emit('notebook:data', msg({ rev: 0 }));
    // Continuous typing every 300 ms: no save until the max wait elapses.
    for (let i = 0; i < 16; i++) {
      ctl.edit({ kind: 'text', text: `t${i}` });
      timers.advance(300);
    }
    const saves = () => sent.filter((m) => m.type === 'notebook:save');
    expect(saves()).toHaveLength(1);
    expect(saves()[0]!.payload.rev).toBe(1);
    expect(timers.now()).toBeGreaterThanOrEqual(SAVE_MAX_WAIT_MS);
    // More typing while in flight: nothing new is sent until the ack.
    ctl.edit({ kind: 'text', text: 'after' });
    timers.advance(SAVE_DEBOUNCE_MS * 3);
    expect(saves()).toHaveLength(1);
    emit('notebook:data', msg({ rev: 1, cause: 'saved', data: saves()[0]!.payload.data }));
    timers.advance(SAVE_DEBOUNCE_MS);
    expect(saves()).toHaveLength(2);
    expect(saves()[1]!.payload).toMatchObject({ matchId: 'm1', rev: 2, data: { text: 'after' } });
    ctl.dispose();
  });

  it('never sends while offline; reloads and saves after reconnecting; retries after a rate limit', () => {
    const { conn, sent, status, emit } = fakeConn();
    const timers = fakeTimers();
    const ctl = createNotebookController(conn, timers);
    emit('notebook:data', msg({ rev: 2 }));
    status.set('reconnecting');
    ctl.edit({ kind: 'note', seat: 0, note: 'typed offline' });
    timers.advance(10_000);
    expect(sent).toEqual([]);
    status.set('open');
    expect(sent.map((m) => m.type)).toEqual(['notebook:load']);
    emit('notebook:data', msg({ rev: 2 })); // nothing newer on the server
    timers.advance(SAVE_DEBOUNCE_MS);
    expect(sent.at(-1)).toMatchObject({ type: 'notebook:save', payload: { rev: 3 } });
    emit('notebook:unavailable', { reason: 'rate_limited', retryInMs: 2000 });
    timers.advance(1900);
    expect(sent.filter((m) => m.type === 'notebook:save')).toHaveLength(1);
    timers.advance(200);
    expect(sent.filter((m) => m.type === 'notebook:save')).toHaveLength(2);
    ctl.dispose();
  });

  it('retries the first load when the server is busy', () => {
    const { conn, sent, emit } = fakeConn();
    const timers = fakeTimers();
    const ctl = createNotebookController(conn, timers);
    ctl.load();
    emit('notebook:unavailable', { reason: 'busy', retryInMs: 5000 });
    timers.advance(5000);
    expect(sent.map((m) => m.type)).toEqual(['notebook:load', 'notebook:load']);
    ctl.dispose();
  });
});
