// (v3 perf; acting for voice) The process reconciler lists up to 4 rooms in parallel. A listing failure must fail
// the run exactly as the sequential loop did, and the run must settle only when every worker stopped: no worker
// starts another listing after the failure, and nothing mutates the result after runOnce() resolved.
import { describe, expect, it } from 'vitest';
import { MemoryVoiceUsageStore } from '@ct/voice';
import type { Logger } from '../src/rooms/modules.js';
import { createVoiceReconciler, type ReconcileRoomService } from '../src/voice/reconciler.js';

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const tick = (ms = 0) => new Promise((f) => setTimeout(f, ms));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { p, resolve, reject };
}

describe('voice reconciler: parallel listings settle on failure (v3 perf)', () => {
  it('after the first listing failure no new listing starts; the run waits for the in-flight ones, then reports failure', async () => {
    const rooms = Array.from({ length: 10 }, (_, i) => ({ name: `dev-lobby${i}-square`, numParticipants: 1 }));
    const pending = new Map<string, ReturnType<typeof deferred<{ identity: string }[]>>>();
    const listed: string[] = [];
    const removed: string[] = [];
    const rs: ReconcileRoomService = {
      async listRooms() {
        return rooms;
      },
      listParticipants(room: string) {
        listed.push(room);
        const d = deferred<{ identity: string }[]>();
        pending.set(room, d);
        return d.p;
      },
      async removeParticipant(room: string, identity: string) {
        removed.push(`${room} ${identity}`);
      },
    };
    const r = createVoiceReconciler({
      prefix: 'dev',
      env: 'test',
      roomService: rs,
      usage: new MemoryVoiceUsageStore(),
      authorize: () => 'orphan',
      now: () => 1_000_000,
      log: silent,
      intervalMs: 60_000,
    });
    let settled = false;
    const run = r.runOnce().then((res) => {
      settled = true;
      return res;
    });
    await tick();
    expect(listed.length).toBe(4); // 4 workers
    pending.get(rooms[0]!.name)!.reject(new Error('livekit down'));
    await tick();
    expect(settled).toBe(false); // three listings still in flight
    expect(listed.length).toBe(4); // and none started after the failure
    pending.get(rooms[1]!.name)!.resolve([{ identity: 'x' }]);
    pending.get(rooms[2]!.name)!.resolve([]);
    await tick();
    expect(settled).toBe(false);
    pending.get(rooms[3]!.name)!.resolve([]);
    const res = await run;
    expect(res.ok).toBe(false);
    expect(res.creditedMs).toBe(0);
    expect(listed.length).toBe(4);
    expect(removed).toEqual([`${rooms[1]!.name} x`]); // an in-flight listing still evicts the orphan it found
    const frozen = JSON.stringify(res);
    await tick(10);
    expect(JSON.stringify(res)).toBe(frozen);
    expect(r.liveParticipants()).toBeNull();
    expect(r.measuring).toBe(false);
  });

  it('a healthy run lists every occupied room once, with at most 4 in flight', async () => {
    const rooms = Array.from({ length: 9 }, (_, i) => ({ name: `dev-lobby${i}-square`, numParticipants: i === 8 ? 0 : 2 }));
    let inFlight = 0;
    let maxInFlight = 0;
    const listed: string[] = [];
    const rs: ReconcileRoomService = {
      async listRooms() {
        return rooms;
      },
      async listParticipants(room: string) {
        listed.push(room);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick(2);
        inFlight--;
        return [{ identity: 'a' }, { identity: 'b' }];
      },
      async removeParticipant() {},
    };
    const r = createVoiceReconciler({
      prefix: 'dev',
      env: 'test',
      roomService: rs,
      usage: new MemoryVoiceUsageStore(),
      authorize: () => 'ok',
      now: () => 1_000_000,
      log: silent,
      intervalMs: 60_000,
    });
    const res = await r.runOnce();
    expect(res.ok).toBe(true);
    expect(res.rooms).toBe(8);
    expect(res.participants).toBe(16);
    expect(listed.length).toBe(8);
    expect(new Set(listed).size).toBe(8);
    expect(maxInFlight).toBe(4);
  });
});
