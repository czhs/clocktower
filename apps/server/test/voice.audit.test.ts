// (v3 perf; acting for voice) VOICE-9 revocation audits, cheaper: one shared listRooms decides which audited rooms
// are worth a listParticipants; rooms LiveKit reports empty cost nothing. Every OCCUPIED audited room is still listed
// at every run (15 s): an earlier draft backed them off to 60 s and was reverted - revocation must stay prompt
// (docs/perf-v3/server.md). The pre-existing behaviour is also covered by voice.test.ts and
// tests/security/voice-cost.test.ts; this file pins the call budget and the worst-case detection delay.
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import type { GamePhase, LocationId } from '@ct/protocol';
import { MemoryVoiceUsageStore } from '@ct/voice';
import type { GameModule, WorldModule } from '../src/rooms/modules.js';
import { createVoiceModule } from '../src/voice/index.js';
import { createFakeHost } from './helpers/fakeHost.js';

const KEY = 'APIvoiceTestKey';
const SECRET = 'voice-test-secret-voice-test-secret-0123456789';
const URL = 'wss://example-test.livekit.cloud';
const L = townLayout;
const TS = L.tileSize;
type P = { x: number; y: number; location: LocationId };
const SQUARE: P = { x: L.square.cx, y: L.square.cy, location: 'outdoors' };
const SQUARE2: P = { x: L.square.cx + TS, y: L.square.cy + TS, location: 'outdoors' };
const house = L.buildings.find((b) => b.kind === 'house' && b.houseIndex === 14)!;
const INSIDE: P = { x: (house.interior.x + 2) * TS + 8, y: (house.interior.y + 2) * TS + 14, location: `bld:${house.id}` };
const SQ_ROOM = 'dev-lobbyA-square';
const HOUSE_ROOM = `dev-lobbyA-bld-${house.id}`;

/** LiveKit as the audit sees it: rooms that exist, who is connected, every API call. */
function fakeLivekit(withListRooms = true) {
  const rooms = new Map<string, Set<string>>();
  const calls: string[] = [];
  let failListRooms = false;
  const rs = {
    async removeParticipant(room: string, identity: string) {
      calls.push(`remove ${room} ${identity}`);
      rooms.get(room)?.delete(identity);
    },
    async listParticipants(room: string) {
      calls.push(`list ${room}`);
      return [...(rooms.get(room) ?? [])].map((identity) => ({ identity }));
    },
    ...(withListRooms
      ? {
          async listRooms() {
            calls.push('listRooms');
            if (failListRooms) throw new Error('down');
            return [...rooms].map(([name, ids]) => ({ name, numParticipants: ids.size }));
          },
        }
      : {}),
  };
  const connect = (room: string, id: string) => {
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room)!.add(id);
  };
  return { rs, rooms, calls, connect, failRooms: (v: boolean) => (failListRooms = v), count: (prefix: string) => calls.filter((c) => c.startsWith(prefix)).length };
}

function setup(o: { listRooms?: boolean; lobbyId?: string; livekit?: ReturnType<typeof fakeLivekit> } = {}) {
  const host = createFakeHost(o.lobbyId ?? 'lobbyA');
  const pos = new Map<string, P>();
  const world = {
    onEvent() {},
    locationOf: (p: string) => pos.get(p)?.location ?? null,
    positionOf: (p: string) => {
      const q = pos.get(p);
      return q ? { x: q.x, y: q.y } : null;
    },
  } as unknown as WorldModule;
  const phase = { v: 'day' as GamePhase | null };
  const game = { onEvent() {}, phase: () => phase.v, seatOf: () => null, isAlive: () => true, directoryPhase: () => 'day' } as unknown as GameModule;
  const lk = o.livekit ?? fakeLivekit(o.listRooms ?? true);
  const voice = createVoiceModule(host, {
    livekit: { url: URL, apiKey: KEY, apiSecret: SECRET, roomPrefix: 'dev', configured: true },
    monthlyMinutes: 5000,
    usage: new MemoryVoiceUsageStore(),
    roomService: lk.rs,
    layout: L,
    tuning: { zoneDebounceMs: 0 },
    limits: { autoOptIn: true, maxPerLobby: 0, maxConcurrent: 0, maxPerIp: 0, idleMs: 0, waitingMaxMs: 0 },
    roomEpochs: false,
    isDisabled: () => false,
  });
  host.setModules({ world, game, voice });
  const join = (pid: string, p: P) => {
    host.addMember({ pid });
    pos.set(pid, p);
    host.emit({ type: 'member_joined', pid });
  };
  const place = (pid: string, p: P) => {
    const prev = pos.get(pid)?.location ?? null;
    pos.set(pid, p);
    if (prev !== p.location) host.emit({ type: 'location_changed', pid, location: p.location, prev });
  };
  /** Every member that holds a zone grant is connected to exactly that room (an honest client). */
  const connectHolders = (pids: string[]) => {
    for (const ids of lk.rooms.values()) for (const p of pids) ids.delete(p);
    for (const p of pids) {
      const r = voice.heldRooms(p).zone;
      if (r) lk.connect(r, p);
    }
  };
  /** Advance in 1 s ticks (the room tick is 24 Hz; 1 s is enough for the 15 s audit cadence). */
  const run = async (ms: number) => {
    for (let t = 0; t < ms; t += 1000) {
      host.clock.now += 1000;
      voice.tick(host.clock.now);
      await voice.whenIdle();
    }
  };
  return { host, voice, lk, join, place, connectHolders, run };
}

describe('VOICE-9 audits: gated by one listRooms, never backed off (v3 perf)', () => {
  it('a revoked member that stays connected is found at the next audit run (more participants than grants)', async () => {
    const t = setup();
    t.join('a', SQUARE);
    t.join('b', SQUARE2);
    await t.voice.whenIdle();
    t.connectHolders(['a', 'b']);
    t.place('a', INSIDE); // revoked from the square ...
    await t.run(1000);
    t.lk.connect(SQ_ROOM, 'a'); // ... but its modified client re-joins with the old token
    t.lk.calls.length = 0;
    await t.run(16_000);
    expect(t.lk.calls).toContain(`remove ${SQ_ROOM} a`);
    expect(t.lk.rooms.get(SQ_ROOM)).toEqual(new Set(['b']));
  });

  it('rooms LiveKit reports empty (or gone) are never listed; listRooms runs once per audit interval', async () => {
    const t = setup();
    t.join('a', INSIDE);
    await t.voice.whenIdle();
    t.connectHolders(['a']);
    t.place('a', SQUARE); // the house room is audited for 20 min from now
    await t.run(1000);
    t.connectHolders(['a']); // honest: left the house room
    t.lk.calls.length = 0;
    await t.run(5 * 60_000);
    expect(t.lk.count(`list ${HOUSE_ROOM}`)).toBe(0);
    expect(t.lk.count('listRooms')).toBeLessThanOrEqual(5 * 4 + 1);
    // ... and someone joining it later with an old token is still found within one interval
    t.lk.connect(HOUSE_ROOM, 'intruder');
    await t.run(16_000);
    expect(t.lk.calls).toContain(`remove ${HOUSE_ROOM} intruder`);
  });

  it('an occupied audited room is listed at every run (15 s), however long nobody unauthorised is found', async () => {
    const t = setup();
    t.join('a', SQUARE);
    t.join('b', SQUARE2);
    t.join('c', SQUARE2);
    await t.voice.whenIdle();
    t.connectHolders(['a', 'b', 'c']);
    t.place('c', INSIDE); // the square is audited; a and b stay there legitimately
    await t.run(1000);
    t.connectHolders(['a', 'b', 'c']);
    t.lk.calls.length = 0;
    const at: number[] = [];
    const start = t.host.clock.now;
    for (let s = 0; s < 10 * 60; s++) {
      const before = t.lk.count(`list ${SQ_ROOM}`);
      await t.run(1000);
      if (t.lk.count(`list ${SQ_ROOM}`) > before) at.push((t.host.clock.now - start) / 1000);
    }
    expect(at.length).toBeGreaterThanOrEqual(39);
    expect(at[0]).toBeLessThanOrEqual(15);
    const gaps = at.slice(1).map((v, i) => v - at[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(15);
  });

  for (const after of [0, 3 * 60_000]) {
    it(`an intruder hiding behind a granted member who is not connected is found at the next run (${after / 60_000} min after the revocation)`, async () => {
      const t = setup();
      t.join('a', SQUARE);
      t.join('b', SQUARE2);
      t.join('c', SQUARE2);
      await t.voice.whenIdle();
      t.connectHolders(['a', 'c']); // b holds a square grant but is not connected
      t.place('c', INSIDE);
      await t.run(1000);
      t.connectHolders(['a', 'c']);
      await t.run(after);
      t.lk.connect(SQ_ROOM, 'c'); // c re-joins the square: participants (a, c) == grants (a, b)
      const t0 = t.host.clock.now;
      let foundAt = -1;
      for (let s = 0; s < 120 && foundAt < 0; s++) {
        await t.run(1000);
        if (t.lk.calls.includes(`remove ${SQ_ROOM} c`)) foundAt = (t.host.clock.now - t0) / 1000;
      }
      expect(foundAt).toBeGreaterThan(0);
      expect(foundAt).toBeLessThanOrEqual(15);
    });
  }

  it('listRooms failing (or missing) falls back to listing every audited room', async () => {
    for (const mode of ['fail', 'missing'] as const) {
      const t = setup({ listRooms: mode === 'fail' });
      if (mode === 'fail') t.lk.failRooms(true);
      t.join('a', INSIDE);
      await t.voice.whenIdle();
      t.place('a', SQUARE);
      await t.run(1000);
      t.lk.connect(HOUSE_ROOM, 'a');
      await t.run(16_000);
      expect(t.lk.calls, mode).toContain(`remove ${HOUSE_ROOM} a`);
    }
  });

  it('lobbies sharing one RoomService share the listRooms call', async () => {
    const lk = fakeLivekit(true);
    const a = setup({ lobbyId: 'lobbyA', livekit: lk });
    const b = setup({ lobbyId: 'lobbyB', livekit: lk });
    for (const t of [a, b]) {
      t.join('p', INSIDE);
      await t.voice.whenIdle();
      t.place('p', SQUARE);
    }
    lk.calls.length = 0;
    // one clock for both (as Date.now in production)
    for (let s = 0; s < 120; s++) {
      for (const t of [a, b]) {
        t.host.clock.now += 1000;
        t.voice.tick(t.host.clock.now);
      }
      await Promise.all([a.voice.whenIdle(), b.voice.whenIdle()]);
    }
    // two lobbies x 8 runs in 2 min would be 16 calls without sharing (rooms are empty: no listParticipants)
    expect(lk.count('listRooms')).toBeLessThanOrEqual(10);
    expect(lk.count('list ')).toBe(0);
  });
});
