// v2.3 security phase B (sec-host): unit tests for the host-safety guards in apps/server/src/guard/
// and the recorder caps. No server needed.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameMeter, installSocketBudget, DEFAULT_SOCKET_BUDGET, liveSocketBudget, type RawSocket } from '../../apps/server/src/guard/socketBudget.js';
import { DEFAULT_HOST_LIMITS, getHostLimits, HOST_LIMIT_KNOBS, onHostLimitsChange, resetHostLimits, setHostLimits } from '../../apps/server/src/guard/hostLimits.js';
import { StreamSlots } from '../../apps/server/src/guard/streamSlots.js';
import { signupBudget } from '../../apps/server/src/guard/signupBudget.js';
import { capRecordBytes } from '../../apps/server/src/guard/recordCaps.js';
import { installProcessGuard } from '../../apps/server/src/guard/process.js';
import { isLocalRequest } from '../../apps/server/src/guard/internal.js';
import { diskView } from '../../apps/server/src/guard/disk.js';
import { GameRecorder, RECORD_LIST_MAX } from '../../apps/server/src/records/recorder.js';
import { CLOSE_CODES } from '../../packages/protocol/src/index.js';
import { CLOSE_CODES as CLIENT_CLOSE_CODES, TERMINAL_CLOSE_CODES } from '../../packages/protocol/src/client.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

describe('HOST-11 socket budget', () => {
  it('FrameMeter allows the burst, refills over time, and trips on frames or bytes', () => {
    const m = new FrameMeter({ frameBurst: 3, framesPerSec: 1, byteBurst: 100, bytesPerSec: 10 }, 0);
    expect([m.take(10, 0), m.take(10, 0), m.take(10, 0)]).toEqual([true, true, true]);
    expect(m.take(1, 0)).toBe(false); // 4th frame in the same instant
    const b = new FrameMeter({ frameBurst: 100, framesPerSec: 100, byteBurst: 100, bytesPerSec: 10 }, 0);
    expect(b.take(60, 0)).toBe(true);
    expect(b.take(60, 0)).toBe(false); // bytes exhausted
    const r = new FrameMeter({ frameBurst: 1, framesPerSec: 1, byteBurst: 100, bytesPerSec: 100 }, 0);
    expect(r.take(1, 0)).toBe(true);
    expect(r.take(1, 1000)).toBe(true); // refilled after 1 s
  });

  it('closes a flooding socket with CLOSE_CODES.abuse (terminal for the client), once', () => {
    let onConnection: ((ws: RawSocket) => void) | null = null;
    installSocketBudget({ on: (_e, fn) => (onConnection = fn) }, silent, { ...DEFAULT_SOCKET_BUDGET, frameBurst: 5, framesPerSec: 0.001 });
    let listener: ((d: unknown) => void) | null = null;
    const ws = { prependListener: (_e: 'message', fn: (d: unknown) => void) => (listener = fn), close: vi.fn(), terminate: vi.fn() };
    onConnection!(ws);
    for (let i = 0; i < 20; i++) listener!(Buffer.alloc(10));
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledWith(4105, expect.any(String));
    expect(CLOSE_CODES.abuse).toBe(4105);
    expect(CLIENT_CLOSE_CODES.abuse).toBe(4105);
    expect(TERMINAL_CLOSE_CODES).toContain(4105);
  });
});

describe('HOST-04 lobby-stream slots', () => {
  it('caps per account and per IP; loopback is exempt from the per-IP cap', () => {
    const s = new StreamSlots({ perAccount: 2, perIp: 3, total: 100 });
    expect(s.acquire('a', '1.1.1.1', () => {}).ok).toBe(true);
    expect(s.acquire('a', '1.1.1.1', () => {}).ok).toBe(true);
    expect(s.acquire('a', '1.1.1.1', () => {})).toMatchObject({ ok: false, status: 429 });
    expect(s.acquire('b', '1.1.1.1', () => {}).ok).toBe(true);
    expect(s.acquire('c', '1.1.1.1', () => {})).toMatchObject({ ok: false, status: 429 });
    for (const acc of ['l1', 'l2', 'l3', 'l4']) expect(s.acquire(acc, '127.0.0.1', () => {}).ok).toBe(true);
  });

  it('a full pool evicts the oldest stream of the heaviest address instead of refusing a newcomer', () => {
    const s = new StreamSlots({ perAccount: 3, perIp: 6, total: 6 });
    const evicted: string[] = [];
    for (let i = 0; i < 6; i++) expect(s.acquire(`hog${Math.floor(i / 3)}`, '9.9.9.9', () => evicted.push(`hog#${i}`), i).ok).toBe(true);
    const got = s.acquire('newbie', '2.2.2.2', () => {}, 100);
    expect(got.ok).toBe(true);
    expect(evicted).toEqual(['hog#0']);
    expect(s.size).toBe(6);
    // released slots are counted down (idempotent release)
    if (got.ok) {
      got.release();
      got.release();
    }
    expect(s.size).toBe(5);
  });

  it('refuses with 503 when no address holds clearly more than the newcomer', () => {
    const s = new StreamSlots({ perAccount: 3, perIp: 6, total: 2 });
    expect(s.acquire('a', '1.1.1.1', () => {}).ok).toBe(true);
    expect(s.acquire('b', '2.2.2.2', () => {}).ok).toBe(true);
    expect(s.acquire('c', '3.3.3.3', () => {})).toMatchObject({ ok: false, status: 503 });
  });
});

describe('HOST-04 global sign-up budget', () => {
  const call = (mw: ReturnType<typeof signupBudget>) => {
    const res = { code: 0, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; }, status(c: number) { this.code = c; return this; }, json() { return this; } };
    let passed = false;
    mw({} as never, res as never, () => (passed = true));
    return { passed, res };
  };
  it('passes the burst, then answers 503 with Retry-After; 0 disables it', () => {
    const mw = signupBudget(3);
    expect([call(mw).passed, call(mw).passed, call(mw).passed]).toEqual([true, true, true]);
    const r = call(mw);
    expect(r.passed).toBe(false);
    expect(r.res.code).toBe(503);
    expect(Number(r.res.headers['Retry-After'])).toBeGreaterThanOrEqual(60);
    const off = signupBudget(0);
    for (let i = 0; i < 50; i++) expect(call(off).passed).toBe(true);
  });
});

describe('HOST-04 record caps', () => {
  it('capRecordBytes halves the largest list until the record fits and notes it', () => {
    const rec = { warnings: [] as string[], seats: Array.from({ length: 20 }, (_, i) => i), timeline: Array.from({ length: 4000 }, (_, i) => ({ i, text: 'x'.repeat(100) })), small: [1, 2, 3] };
    capRecordBytes(rec, 100_000);
    expect(Buffer.byteLength(JSON.stringify(rec))).toBeLessThanOrEqual(100_000);
    expect(rec.seats).toHaveLength(20);
    expect(rec.timeline[0]!.i).toBe(0); // the beginning (setup) is kept
    expect(rec.timeline.at(-1)!.i).toBe(3999); // and the end
    expect(rec.warnings.length).toBeGreaterThan(0);
  });

  it('GameRecorder.enforceCaps bounds every high-volume list and keeps head + tail', () => {
    const lists = ['timeline', 'publicItems', 'statusChanges', 'commands', 'actions', 'connections', 'log', 'info', 'announcements', 'visits'];
    const fake = Object.assign(Object.create(GameRecorder.prototype), {
      warnings: [],
      droppedEntries: 0,
      cappedLists: new Set<string>(),
      undoStack: [{ seq: 990, desc: '' }],
      byCmd: new Map(Array.from({ length: 1000 }, (_, i) => [i + 1, []])),
      cmdSeq: 1000,
      ...Object.fromEntries(lists.map((k) => [k, [] as number[]])),
    }) as GameRecorder & Record<string, unknown>;
    for (let i = 0; i < RECORD_LIST_MAX + 1234; i++) (fake.commands as unknown as number[]).push(i);
    fake.enforceCaps();
    const c = fake.commands as unknown as number[];
    expect(c).toHaveLength(RECORD_LIST_MAX);
    expect(c[0]).toBe(0);
    expect(c.at(-1)).toBe(RECORD_LIST_MAX + 1233);
    expect(fake.droppedEntries).toBe(1234);
    expect(fake.warnings).toHaveLength(1);
    expect((fake as unknown as { byCmd: Map<number, unknown> }).byCmd.size).toBe(11); // seqs 990..1000 kept
  });
});

describe('HOST-05 process guard', () => {
  let dispose: (() => void) | null = null;
  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('keeps running on isolated uncaught errors and shuts down only on a burst', () => {
    const shutdown = vi.fn();
    const errors: string[] = [];
    const g = installProcessGuard({ log: { ...silent, error: (m: string) => errors.push(m) }, shutdown, maxBurst: 3, windowMs: 60_000 });
    dispose = g.dispose;
    expect(process.listeners('uncaughtException')).toHaveLength(1);
    process.emit('uncaughtException', new Error('one'));
    // (unhandledRejection uses the same counter; not emitted here because vitest also listens for it)
    process.emit('uncaughtException', new Error('two'));
    process.emit('uncaughtException', new Error('three'));
    expect(shutdown).not.toHaveBeenCalled();
    process.emit('uncaughtException', new Error('four'));
    expect(shutdown).toHaveBeenCalledTimes(1);
    process.emit('uncaughtException', new Error('five'));
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(g.stats).toMatchObject({ uncaught: 5, rejections: 0 });
    expect(errors.some((m) => m.includes('kept running'))).toBe(true);
  });

  it('rate-limits console.error (e.g. @colyseus/schema per-frame decode warnings)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = installProcessGuard({ log: silent, shutdown: () => {}, consoleLinesPerMin: 5 });
    dispose = () => {
      g.dispose();
      spy.mockRestore();
    };
    for (let i = 0; i < 100; i++) console.error(`decode.utf8Read(): Invalid byte ${i}`);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(g.stats.consoleSuppressed).toBe(95);
  });
});

describe('HOST-07 local-request test', () => {
  const req = (peer: string, ip: string, headers: Record<string, string> = {}) => ({ socket: { remoteAddress: peer }, ip, headers }) as never;
  it('only a loopback peer without proxy headers is local', () => {
    expect(isLocalRequest(req('127.0.0.1', '127.0.0.1'))).toBe(true);
    expect(isLocalRequest(req('::1', '::1'))).toBe(true);
    expect(isLocalRequest(req('127.0.0.1', '203.0.113.1', { 'x-forwarded-for': '203.0.113.1' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', '127.0.0.1', { 'x-forwarded-for': '127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', '127.0.0.1', { 'cf-connecting-ip': '127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', '127.0.0.1', { forwarded: 'for=1.2.3.4' }))).toBe(false);
    expect(isLocalRequest(req('10.0.0.5', '10.0.0.5'))).toBe(false);
  });
});

describe('HOST-04 disk view', () => {
  it('reports DB size (incl. -wal) and free space', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ct-disk-'));
    try {
      const db = path.join(dir, 'x.db');
      writeFileSync(db, Buffer.alloc(1000));
      writeFileSync(db + '-wal', Buffer.alloc(500));
      const v = diskView(db);
      expect(v.dbBytes).toBe(1500);
      expect(v.freeBytes).toBeGreaterThan(0);
      expect(v.totalBytes).toBeGreaterThan(v.freeBytes!);
      expect(['ok', 'low', 'critical']).toContain(v.level);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('host limits are live settings (for the admin registry)', () => {
  afterEach(() => resetHostLimits());

  it('validates ranges and notifies listeners', () => {
    const seen: number[] = [];
    const off = onHostLimitsChange((l) => seen.push(l.sseMaxPerIp));
    expect(setHostLimits({ sseMaxPerIp: 9 }).sseMaxPerIp).toBe(9);
    expect(() => setHostLimits({ sseMaxPerIp: 0 })).toThrow(RangeError);
    expect(() => setHostLimits({ nope: 1 } as never)).toThrow(RangeError);
    expect(() => setHostLimits({ socketByteBurst: 1.5 })).toThrow(RangeError);
    off();
    expect(seen).toEqual([9]);
    for (const k of HOST_LIMIT_KNOBS) expect(DEFAULT_HOST_LIMITS[k.key], k.key).toBeGreaterThanOrEqual(k.min);
  });

  it('existing meters, slots and the sign-up budget pick up a change without a restart', () => {
    const m = new FrameMeter(liveSocketBudget, 0);
    setHostLimits({ socketFrameBurst: 100, socketFramesPerSec: 20 });
    let ok = 0;
    for (let i = 0; i < 150; i++) if (m.take(1, 0)) ok++;
    expect(ok).toBeLessThanOrEqual(100);
    const s = new StreamSlots(() => ({ perAccount: 3, perIp: getHostLimits().sseMaxPerIp, total: 100 }));
    setHostLimits({ sseMaxPerIp: 1 });
    expect(s.acquire('a', '5.5.5.5', () => {}).ok).toBe(true);
    expect(s.acquire('b', '5.5.5.5', () => {}).ok).toBe(false);
    let perHour = 0;
    const mw = signupBudget(() => perHour);
    const pass = () => {
      let p = false;
      const res = { setHeader() {}, status() { return this; }, json() { return this; } };
      mw({} as never, res as never, () => (p = true));
      return p;
    };
    expect(pass()).toBe(true); // 0 = unlimited
    perHour = 1;
    expect([pass(), pass()]).toEqual([true, false]);
  });
});
