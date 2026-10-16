// Security v2.3, area 6 (sec-voice): LiveKit token scope + voice cost / abuse controls.
// Findings: docs/security-v2.3/06-voice-cost.md (VOICE-1..12). Fake LiveKit credentials only; the
// LiveKit server API is a fake RoomService; no network.
import { afterEach, describe, expect, it } from 'vitest';
import { townLayout } from '../../packages/assets/src/index.js';
import type { GamePhase, LocationId, VoiceGrant, VoiceRevoke, VoiceUnavailable } from '../../packages/protocol/src/index.js';
import { decodeJwtPayload, MemoryVoiceUsageStore, mintVoiceToken, monthKeyUtc, parseRoomName, roomNameFor, TokenVerifier } from '../../packages/voice/src/index.js';
import type { GameModule, Logger, WorldModule } from '../../apps/server/src/rooms/modules.js';
import { createVoiceModule, setVoiceSettingsProvider, voiceSettings, type VoiceLimits } from '../../apps/server/src/voice/index.js';
import { configureVoiceFlagStore, resetVoiceControlForTests, setVoiceDisabled, setVoiceEnvDisabled, voiceControlState, voiceKill, voiceRestore, isVoiceDisabled } from '../../apps/server/src/voice/control.js';
import { createVoiceReconciler, HeartbeatBuffer } from '../../apps/server/src/voice/reconciler.js';
import { createVoiceAlerts } from '../../apps/server/src/voice/alerts.js';
import { readVoiceEnv } from '../../apps/server/src/voice/env.js';
import { ipKeyFromJoin } from '../../apps/server/src/voice/ip.js';
import { createFakeHost } from '../../apps/server/test/helpers/fakeHost.js';

const KEY = 'APIe2efakekey';
const SECRET = 'sec-voice-fake-secret-sec-voice-fake-secret-0123';
const URL = 'wss://fake-sec-voice.livekit.cloud';
const L = townLayout;
const TS = L.tileSize;
const LOBBY = 'amber-fox-lantern';
const ENC = 'amber_dfox_dlantern';
type P = { x: number; y: number; location: LocationId };
const SQUARE: P = { x: L.square.cx, y: L.square.cy, location: 'outdoors' };
const houseOf = (seat: number) => L.buildings.find((b) => b.kind === 'house' && b.houseIndex === seat)!.id;
function inside(id: string): P {
  const b = L.buildings.find((bb) => bb.id === id)!;
  return { x: (b.interior.x + 2) * TS + 8, y: (b.interior.y + 2) * TS + 14, location: `bld:${id}` };
}
const X = houseOf(13);

const logs: { level: string; msg: string; fields?: Record<string, unknown> }[] = [];
const log: Logger = {
  debug() {},
  info: (msg, fields) => void logs.push({ level: 'info', msg, fields }),
  warn: (msg, fields) => void logs.push({ level: 'warn', msg, fields }),
  error: (msg, fields) => void logs.push({ level: 'error', msg, fields }),
};

interface SetupOpts {
  monthlyMinutes?: number;
  limits?: Partial<VoiceLimits>;
  disabled?: () => boolean;
  otherHolders?: () => number;
  ip?: Record<string, string>;
  otherIpHolders?: (ip: string) => number;
  lobbyId?: string;
  /** Use the live settings (env defaults + setVoiceSettingsProvider) instead of fixed limits. */
  liveSettings?: boolean;
}

function setup(o: SetupOpts = {}) {
  const host = createFakeHost(o.lobbyId ?? LOBBY);
  const pos = new Map<string, P>();
  const phase = { v: null as GamePhase | null };
  const world = {
    onEvent() {},
    locationOf: (p: string) => pos.get(p)?.location ?? null,
    positionOf: (p: string) => pos.get(p) ?? null,
  } as unknown as WorldModule;
  const game = { onEvent() {}, phase: () => phase.v, seatOf: () => null } as unknown as GameModule;
  const usage = new MemoryVoiceUsageStore();
  const calls: string[] = [];
  const removed: [string, string][] = [];
  const stripped: [string, string][] = [];
  let failRemovals = 0;
  /** What LiveKit would report as connected (room -> identities). */
  const livekit = new Map<string, string[]>();
  const rs = {
    async removeParticipant(room: string, identity: string) {
      calls.push(`remove ${room} ${identity}`);
      if (failRemovals > 0) {
        failRemovals--;
        throw Object.assign(new Error('rate limited'), { status: 429 });
      }
      removed.push([room, identity]);
      livekit.set(room, (livekit.get(room) ?? []).filter((i) => i !== identity));
    },
    async listParticipants(room: string) {
      return (livekit.get(room) ?? []).map((identity) => ({ identity }));
    },
    async updateParticipant(room: string, identity: string, opts: { permission: Record<string, boolean> }) {
      calls.push(`update ${room} ${identity}`);
      expect(opts.permission).toEqual({ canSubscribe: false, canPublish: false, canPublishData: false });
      stripped.push([room, identity]);
    },
    async listRooms() {
      return [...livekit.keys()].map((name) => ({ name, numParticipants: livekit.get(name)!.length }));
    },
  };
  let epoch = 0;
  const voice = createVoiceModule(host, {
    livekit: { url: URL, apiKey: KEY, apiSecret: SECRET, roomPrefix: 'prod', configured: true },
    ...(o.liveSettings ? {} : { monthlyMinutes: o.monthlyMinutes ?? 5000 }),
    usage,
    roomService: rs,
    layout: L,
    tuning: { zoneDebounceMs: 0 },
    ...(o.liveSettings ? {} : { limits: { autoOptIn: false, maxPerLobby: 16, maxConcurrent: 40, maxPerIp: 4, idleMs: 20 * 60_000, waitingMaxMs: 60 * 60_000, ...o.limits } }),
    isDisabled: o.disabled ?? (() => false),
    otherHolders: o.otherHolders ?? (() => 0),
    ipOf: (pid) => o.ip?.[pid] ?? null,
    otherIpHolders: o.otherIpHolders ?? (() => 0),
    newEpoch: () => `e${String(++epoch).padStart(4, '0')}`,
  });
  host.setModules({ world, game, voice });
  const join = (pid: string, p: P = SQUARE, extra: { role?: 'player' | 'storyteller'; seat?: number | null } = {}) => {
    host.addMember({ pid, displayName: `Name ${pid}`, ...extra });
    pos.set(pid, p);
    host.emit({ type: 'member_joined', pid });
  };
  const want = (pid: string, wanted = true) => voice.handleStatus(pid, { connected: false, publishing: false, wanted });
  const place = (pid: string, p: P) => {
    const prev = pos.get(pid)?.location ?? null;
    pos.set(pid, p);
    if (prev !== p.location) host.emit({ type: 'location_changed', pid, location: p.location, prev });
  };
  const setPhase = (v: GamePhase | null) => {
    const prev = phase.v;
    phase.v = v;
    if (v) host.emit({ type: 'phase_changed', phase: v, prev, phaseEndsAt: null });
  };
  /** Advance in 1 s ticks (maintain / removal cadences). */
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 1000) {
      host.clock.now += Math.min(1000, ms - t);
      voice.tick(host.clock.now);
    }
  };
  const msgs = (pid: string) => host.sent.get(pid) ?? [];
  const grants = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:grant').map((m) => m.payload as VoiceGrant);
  const revokes = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:revoke').map((m) => m.payload as VoiceRevoke);
  const unavail = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:unavailable').map((m) => m.payload as VoiceUnavailable);
  const zoneRoom = (pid: string) => voice.heldRooms(pid).zone;
  return {
    host, voice, usage, removed, stripped, calls, livekit, rs, pos, phase, join, want, place, setPhase, advance, grants, revokes, unavail, zoneRoom,
    failRemovals: (n: number) => void (failRemovals = n),
    idle: () => voice.whenIdle(),
  };
}

afterEach(() => {
  resetVoiceControlForTests();
  setVoiceSettingsProvider(null);
  logs.length = 0;
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-13: LiveKit token scope (checked OK)', () => {
  it('a minted token carries only identity, name, one-room join, mic-only publish, 600 s TTL', async () => {
    const room = `prod-${ENC}-square_e0001`;
    const token = await mintVoiceToken({ apiKey: KEY, apiSecret: SECRET, identity: 'p_abc', name: 'Ada', room, canPublish: true });
    const claims = decodeJwtPayload(token);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iss', 'name', 'nbf', 'sub', 'video']);
    expect(claims.sub).toBe('p_abc');
    expect((claims.exp as number) - (claims.nbf as number)).toBe(600);
    expect(claims.video).toEqual({
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: ['microphone'],
    });
    await expect(new TokenVerifier(KEY, SECRET).verify(token)).resolves.toBeTruthy();
    await expect(new TokenVerifier(KEY, 'wrong-secret-wrong-secret-wrong-secret-00').verify(token)).rejects.toThrow();
  });

  it('identity = server pid, name = server display name, room = this lobby (with an epoch)', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const g = t.grants('p_1').at(-1)!;
    const c = decodeJwtPayload(g.token);
    expect(c.sub).toBe('p_1');
    expect(c.name).toBe('Name p_1');
    const room = (c.video as { room: string }).room;
    expect(parseRoomName('prod', room)).toEqual({ lobbyId: LOBBY, zone: 'square', epoch: 'e0001' });
  });

  it('room names with epochs round-trip and stay injective', () => {
    expect(roomNameFor('prod', 'a-b', 'bld:house-3', 'abcd12')).toBe('prod-a_db-bld-house-3_abcd12');
    expect(parseRoomName('prod', 'prod-a_db-bld-house-3_abcd12')).toEqual({ lobbyId: 'a-b', zone: 'bld:house-3', epoch: 'abcd12' });
    expect(parseRoomName('prod', 'prod-a_db-bld-house-3_AB')).toBeNull();
    expect(() => roomNameFor('prod', 'L1', 'square', 'bad_epoch')).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-1 / VOICE-5: LiveKit reconciler (usage + orphan sweep)', () => {
  function rec(t: ReturnType<typeof setup>, opts: { heartbeats?: HeartbeatBuffer; fail?: boolean } = {}) {
    let now = t.host.clock.now;
    const rs = opts.fail ? { ...t.rs, listRooms: async () => Promise.reject(new Error('down')) } : t.rs;
    const r = createVoiceReconciler({
      prefix: 'prod',
      env: 'production',
      roomService: rs,
      usage: t.usage,
      ...(opts.heartbeats ? { heartbeats: opts.heartbeats } : {}),
      authorize: (lobbyId, identity, room) => (lobbyId !== t.voice.lobbyId ? 'orphan' : t.voice.isAuthorized(identity, room) ? 'ok' : 'unauthorized'),
      evictVia: (lobbyId, room, identity) => {
        if (lobbyId !== t.voice.lobbyId) return false;
        t.voice.evict(room, identity);
        return true;
      },
      now: () => now,
      log,
      intervalMs: 60_000,
    });
    return { r, tick: (ms: number) => (now += ms) };
  }

  it('VOICE-1: a participant LiveKit reports is accounted even without heartbeats', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    t.livekit.set(room, ['p_1']); // connected with a headless client, never sends voice:status
    const { r, tick } = rec(t);
    await r.runOnce(); // first run credits one interval
    for (let i = 0; i < 9; i++) {
      tick(60_000);
      await r.runOnce();
    }
    expect(t.usage.get(monthKeyUtc(t.host.clock.now)).totalMs).toBe(10 * 60_000);
    expect(r.liveParticipants()).toBe(1);
    // A huge gap (event-loop stall / suspend) never over-counts beyond 1.5 intervals.
    tick(60 * 60_000);
    await r.runOnce();
    expect(t.usage.get(monthKeyUtc(t.host.clock.now)).totalMs).toBe(10 * 60_000 + 90_000);
  });

  it('VOICE-1: heartbeat estimates are dropped when LiveKit was listed, used only when it was not', async () => {
    const t = setup();
    const buf = new HeartbeatBuffer(t.usage);
    buf.add('production', monthKeyUtc(t.host.clock.now), 30_000);
    const ok = rec(t, { heartbeats: buf });
    await ok.r.runOnce();
    expect(t.usage.get(monthKeyUtc(t.host.clock.now)).totalMs).toBe(0);
    buf.add('production', monthKeyUtc(t.host.clock.now), 30_000);
    const down = rec(t, { heartbeats: buf, fail: true });
    const res = await down.r.runOnce();
    expect(res.ok).toBe(false);
    expect(down.r.liveParticipants()).toBeNull();
    expect(t.usage.get(monthKeyUtc(t.host.clock.now)).totalMs).toBe(30_000);
    expect(logs.some((l) => l.msg.includes('LiveKit room listing failed'))).toBe(true);
  });

  it("VOICE-5: participants in this env's rooms that no live lobby authorises are stripped and removed", async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    t.livekit.set(room, ['p_1', 'p_intruder']);
    t.livekit.set(`prod-old_dlobby-bld-house-2_e9999`, ['p_ghost']); // disposed lobby
    t.livekit.set(`dev-${ENC}-square`, ['p_other_env']); // other env: not ours
    const { r } = rec(t);
    const res = await r.runOnce();
    await t.idle();
    expect(res.evicted).toEqual(expect.arrayContaining([[room, 'p_intruder'], ['prod-old_dlobby-bld-house-2_e9999', 'p_ghost']]));
    expect(res.evicted).toHaveLength(2);
    expect(t.removed).toEqual(expect.arrayContaining([[room, 'p_intruder'], ['prod-old_dlobby-bld-house-2_e9999', 'p_ghost']]));
    expect(t.stripped).toEqual(expect.arrayContaining([[room, 'p_intruder'], ['prod-old_dlobby-bld-house-2_e9999', 'p_ghost']]));
    expect(t.removed.map((r) => r[1])).not.toContain('p_1');
    expect(t.removed.map((r) => r[1])).not.toContain('p_other_env');
  });

  it('VOICE-5: after a lobby is disposed, a participant that re-joined its room is swept', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    await t.voice.dispose();
    t.livekit.set(room, ['p_1']); // re-joined with its old token
    const { r } = rec(t);
    const res = await r.runOnce();
    expect(res.evicted).toEqual([[room, 'p_1']]);
    expect(t.removed).toContainEqual([room, 'p_1']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-2 / VOICE-6: hard stop at the quota and the kill switch', () => {
  it('VOICE-2: at quota exhaustion connected participants are revoked and removed from LiveKit', async () => {
    const t = setup({ monthlyMinutes: 10 });
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    t.usage.add('test', monthKeyUtc(t.host.clock.now), 10 * 60_000);
    t.advance(3_000);
    await t.idle();
    expect(t.revokes('p_1').map((r) => r.reason)).toContain('quota');
    expect(t.removed).toContainEqual([room, 'p_1']);
    expect(t.unavail('p_1').at(-1)?.reason).toBe('quota_exhausted');
    // No new grant while exhausted, even after retries.
    const n = t.grants('p_1').length;
    t.advance(30_000);
    await t.idle();
    expect(t.grants('p_1')).toHaveLength(n);
  });

  it('VOICE-6: voiceKill() revokes every grant at once; voiceRestore() re-grants wanted members', async () => {
    const t = setup({ disabled: isVoiceDisabled });
    t.join('p_1');
    t.join('p_2', inside(X));
    t.want('p_1');
    t.want('p_2');
    await t.idle();
    const r1 = t.zoneRoom('p_1')!;
    const r2 = t.zoneRoom('p_2')!;
    const st = voiceKill('cost spike');
    await t.idle();
    expect(st).toMatchObject({ disabled: true, disabledBy: 'admin', reason: 'cost spike' });
    for (const p of ['p_1', 'p_2']) {
      expect(t.revokes(p).at(-1)?.reason).toBe('disabled');
      expect(t.unavail(p).at(-1)?.reason).toBe('disabled');
      expect(t.voice.heldRooms(p)).toEqual({ zone: null, announce: null });
    }
    expect(t.removed).toEqual(expect.arrayContaining([[r1, 'p_1'], [r2, 'p_2']]));
    // Joining while disabled: told at once, no token.
    t.join('p_3');
    t.want('p_3');
    t.advance(10_000);
    await t.idle();
    expect(t.grants('p_3')).toEqual([]);
    expect(t.unavail('p_3').at(-1)?.reason).toBe('disabled');
    voiceRestore();
    await t.idle();
    expect(voiceControlState().disabled).toBe(false);
    for (const p of ['p_1', 'p_2', 'p_3']) expect(t.zoneRoom(p)).not.toBeNull();
  });

  it('VOICE-6: the persisted flag is loaded at start; an unreadable flag means disabled (safe default)', () => {
    const saved: boolean[] = [];
    expect(configureVoiceFlagStore({ load: () => true, save: (d) => void saved.push(d) })).toMatchObject({ disabled: true, disabledBy: 'admin' });
    expect(setVoiceDisabled(false)).toMatchObject({ disabled: false, persisted: true });
    expect(saved).toEqual([false]);
    resetVoiceControlForTests();
    expect(
      configureVoiceFlagStore({
        load: () => {
          throw new Error('db locked');
        },
        save: () => undefined,
      }),
    ).toMatchObject({ disabled: true, disabledBy: 'unknown' });
    expect(setVoiceDisabled(false).disabled).toBe(false);
  });

  it('VOICE-6: VOICE_DISABLED=1 wins over the admin toggle', () => {
    expect(readVoiceEnv({ VOICE_DISABLED: '1' }).disabled).toBe(true);
    setVoiceEnvDisabled(true);
    expect(setVoiceDisabled(false)).toMatchObject({ disabled: true, disabledBy: 'env' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-3: dropped game connection', () => {
  it('a member disconnected from the room for > 60 s is removed from LiveKit', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    t.host.member('p_1')!.connected = false;
    t.host.emit({ type: 'member_connection', pid: 'p_1', connected: false });
    t.advance(30_000);
    await t.idle();
    expect(t.removed).not.toContainEqual([room, 'p_1']);
    t.advance(35_000);
    await t.idle();
    expect(t.removed).toContainEqual([room, 'p_1']);
    // Reconnecting re-grants (voice was still wanted).
    t.host.member('p_1')!.connected = true;
    t.host.emit({ type: 'member_connection', pid: 'p_1', connected: true });
    await t.idle();
    expect(t.zoneRoom('p_1')).not.toBeNull();
  });

  it('a short drop keeps the grant (no revoke)', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    t.host.member('p_1')!.connected = false;
    t.host.emit({ type: 'member_connection', pid: 'p_1', connected: false });
    t.advance(20_000);
    t.host.member('p_1')!.connected = true;
    t.host.emit({ type: 'member_connection', pid: 'p_1', connected: true });
    t.advance(60_000);
    await t.idle();
    expect(t.revokes('p_1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-4: opt-in and caps', () => {
  it('no LiveKit token is minted before the member opts in; opting out revokes and removes', async () => {
    const t = setup();
    t.join('p_1');
    t.advance(30_000);
    await t.idle();
    expect(t.grants('p_1')).toEqual([]);
    t.want('p_1');
    await t.idle();
    expect(t.grants('p_1')).toHaveLength(1);
    const room = t.zoneRoom('p_1')!;
    t.want('p_1', false);
    await t.idle();
    expect(t.revokes('p_1').at(-1)).toMatchObject({ room, reason: 'left' });
    expect(t.removed).toContainEqual([room, 'p_1']);
    t.advance(30_000);
    expect(t.grants('p_1')).toHaveLength(1);
  });

  it('a status without `wanted` (pre-v2.3 client) counts as opted in', async () => {
    const t = setup();
    t.join('p_1');
    t.voice.handleStatus('p_1', { connected: false, publishing: false });
    await t.idle();
    expect(t.grants('p_1')).toHaveLength(1);
  });

  it('per-lobby cap: the next member gets busy and is granted when a place frees up', async () => {
    const t = setup({ limits: { maxPerLobby: 2 } });
    for (const p of ['a', 'b', 'c']) {
      t.join(p);
      t.want(p);
    }
    await t.idle();
    expect(t.zoneRoom('a')).not.toBeNull();
    expect(t.zoneRoom('b')).not.toBeNull();
    expect(t.zoneRoom('c')).toBeNull();
    expect(t.unavail('c').at(-1)?.reason).toBe('busy');
    t.want('a', false);
    t.advance(6_000);
    await t.idle();
    expect(t.zoneRoom('c')).not.toBeNull();
  });

  it('process-wide and per-IP caps', async () => {
    const t1 = setup({ otherHolders: () => 40 }); // setup() pins maxConcurrent 40
    t1.join('a');
    t1.want('a');
    await t1.idle();
    expect(t1.unavail('a').at(-1)?.reason).toBe('busy');
    const t2 = setup({ ip: { a: '203.0.113.7', b: '203.0.113.7', c: '198.51.100.1' }, limits: { maxPerIp: 1 } });
    for (const p of ['a', 'b', 'c']) {
      t2.join(p);
      t2.want(p);
    }
    await t2.idle();
    expect(t2.zoneRoom('a')).not.toBeNull();
    expect(t2.zoneRoom('b')).toBeNull();
    expect(t2.zoneRoom('c')).not.toBeNull();
    expect(t2.voice.holdersWithIp('203.0.113.7')).toBe(1);
    const t3 = setup({ ip: { a: '203.0.113.7' }, otherIpHolders: () => 4 });
    t3.join('a');
    t3.want('a');
    await t3.idle();
    expect(t3.unavail('a').at(-1)?.reason).toBe('busy');
  });

  it('join IP key: rightmost X-Forwarded-For behind a loopback proxy, IPv6 per /64, socket peer otherwise', () => {
    const viaTunnel = { headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, req: { socket: { remoteAddress: '127.0.0.1' } } } as never;
    expect(ipKeyFromJoin(viaTunnel)).toBe('203.0.113.9');
    const v6 = { headers: { 'x-forwarded-for': '2001:db8:1:2:aaaa::1' }, req: { socket: { remoteAddress: '::1' } } } as never;
    expect(ipKeyFromJoin(v6)).toBe('2001:0db8:0001:0002::/64');
    const direct = { headers: { 'x-forwarded-for': '9.9.9.9' }, req: { socket: { remoteAddress: '198.51.100.4' } } } as never;
    expect(ipKeyFromJoin(direct)).toBe('198.51.100.4');
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-7: idle limits', () => {
  it('20 min without talking / moving in the waiting room switches voice off (no re-grant)', async () => {
    const t = setup();
    t.join('p_1');
    t.want('p_1');
    await t.idle();
    const room = t.zoneRoom('p_1')!;
    t.advance(19 * 60_000);
    expect(t.zoneRoom('p_1')).toBe(room);
    t.advance(61_000);
    await t.idle();
    expect(t.revokes('p_1').at(-1)).toMatchObject({ room, reason: 'idle' });
    expect(t.unavail('p_1').at(-1)?.reason).toBe('idle');
    expect(t.removed).toContainEqual([room, 'p_1']);
    t.advance(60_000);
    expect(t.zoneRoom('p_1')).toBeNull();
    t.want('p_1'); // "Enable voice" again
    await t.idle();
    expect(t.zoneRoom('p_1')).not.toBeNull();
  });

  it('moving, talking, or someone talking in my room keeps voice on; night pauses the clock', async () => {
    const t = setup({ limits: { waitingMaxMs: 0 } });
    t.join('mover');
    t.join('listener');
    t.join('talker');
    for (const p of ['mover', 'listener', 'talker']) t.want(p);
    await t.idle();
    const room = t.zoneRoom('talker')!;
    for (let i = 0; i < 5; i++) {
      t.advance(10 * 60_000);
      t.pos.set('mover', { ...SQUARE, x: SQUARE.x + (i % 2 ? 4 : -4) });
      t.voice.handleStatus('talker', { connected: true, publishing: true, room, wanted: true });
    }
    t.advance(1000);
    for (const p of ['mover', 'listener', 'talker']) expect(t.zoneRoom(p)).toBe(room);
    const g = setup({ limits: { waitingMaxMs: 0 } });
    g.join('p0', SQUARE, { seat: 0 });
    g.want('p0');
    g.setPhase('night');
    g.place('p0', inside(houseOf(0)));
    await g.idle();
    g.advance(90 * 60_000);
    expect(g.zoneRoom('p0')).not.toBeNull();
  });

  it('continuous waiting-room voice is capped (60 min) even when active', async () => {
    const t = setup();
    t.join('a');
    t.join('b');
    t.want('a');
    t.want('b');
    await t.idle();
    const room = t.zoneRoom('a')!;
    for (let i = 0; i < 12; i++) {
      t.advance(5 * 60_000);
      t.voice.handleStatus('a', { connected: true, publishing: true, room, wanted: true });
    }
    t.advance(2_000);
    expect(t.unavail('a').at(-1)?.reason).toBe('idle');
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-8: alerts', () => {
  it('logs once per level per month and POSTs the webhook', async () => {
    const posted: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('ok');
    }) as unknown as typeof fetch;
    const a = createVoiceAlerts({ log, webhook: 'https://alerts.example.invalid/hook', fetchImpl });
    const base = { env: 'production', month: '2026-10', limit: 5000, liveParticipants: 3, maxConcurrent: 40 };
    expect(a.check({ ...base, minutes: 1000 })).toEqual([]);
    expect(a.check({ ...base, minutes: 3600 }).map((p) => p.level)).toEqual(['warn']);
    expect(a.check({ ...base, minutes: 3700 })).toEqual([]);
    expect(a.check({ ...base, minutes: 5100 }).map((p) => p.level)).toEqual(['critical', 'exhausted']);
    expect(a.check({ ...base, month: '2026-11', minutes: 3600 }).map((p) => p.level)).toEqual(['warn']);
    expect(a.check({ ...base, minutes: 10, liveParticipants: 40 }).map((p) => p.kind)).toEqual(['capacity']);
    await a.idle();
    expect(posted).toHaveLength(5);
    expect(posted[0]).toMatchObject({ url: 'https://alerts.example.invalid/hook', body: { app: 'clocktower', kind: 'quota', level: 'warn', minutes: 3600, limit: 5000 } });
    expect(logs.filter((l) => l.msg === 'voice quota level').map((l) => l.level)).toEqual(['warn', 'warn', 'error', 'warn']);
    expect(JSON.stringify(logs)).not.toContain('alerts.example.invalid');
  });

  it('only https (or loopback) webhooks are accepted', () => {
    expect(readVoiceEnv({ VOICE_ALERT_WEBHOOK: 'http://evil.example/x' }).alertWebhook).toBeNull();
    expect(readVoiceEnv({ VOICE_ALERT_WEBHOOK: 'https://ntfy.sh/ct' }).alertWebhook).toBe('https://ntfy.sh/ct');
    expect(readVoiceEnv({ VOICE_TEST_AUTO_OPT_IN: '1', LIVEKIT_ROOM_PREFIX: 'prod' }).testAutoOptIn).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-9: private room rotation + intruder stripping', () => {
  it('a member leaving does NOT rename an occupied room (no audio drop for the others); an empty room is renamed', async () => {
    const t = setup();
    t.join('a', inside(X));
    t.join('b', inside(X));
    t.want('a');
    t.want('b');
    await t.idle();
    const r0 = t.zoneRoom('a')!;
    expect(t.zoneRoom('b')).toBe(r0);
    t.place('a', SQUARE); // a leaves, b stays
    t.advance(1000);
    await t.idle();
    expect(t.zoneRoom('b')).toBe(r0);
    expect(t.revokes('b')).toEqual([]);
    expect(t.voice.isAuthorized('a', r0)).toBe(false);
    t.place('b', SQUARE); // now empty
    t.advance(1000);
    t.place('a', inside(X));
    t.advance(1000);
    await t.idle();
    expect(t.zoneRoom('a')).not.toBe(r0);
    expect(parseRoomName('prod', t.zoneRoom('a')!)?.zone).toBe(`bld:${X}`);
  });

  it('bedtime / night / dawn rename every room; members still inside are moved once (reason phase)', async () => {
    const t = setup();
    t.join('a', inside(X));
    t.join('b', inside(X));
    t.join('c');
    for (const p of ['a', 'b', 'c']) t.want(p);
    t.setPhase('day');
    await t.idle();
    const rx = t.zoneRoom('a')!;
    const sq = t.zoneRoom('c')!;
    t.setPhase('bedtime');
    t.advance(1000);
    await t.idle();
    expect(t.zoneRoom('a')).not.toBe(rx);
    expect(t.zoneRoom('b')).toBe(t.zoneRoom('a'));
    expect(t.zoneRoom('c')).not.toBe(sq);
    for (const p of ['a', 'b', 'c']) expect(t.revokes(p).at(-1)?.reason).toBe('phase');
    const n = t.grants('a').length;
    t.advance(5_000);
    await t.idle();
    expect(t.grants('a')).toHaveLength(n); // once per phase change, not repeatedly
  });

  it("the square is not reshuffled while people talk there (public), but renamed once it empties", async () => {
    const t = setup();
    t.join('a');
    t.join('b');
    t.want('a');
    t.want('b');
    await t.idle();
    const sq = t.zoneRoom('a')!;
    t.place('a', inside(X));
    t.advance(1000);
    await t.idle();
    expect(t.zoneRoom('b')).toBe(sq);
    expect(t.revokes('b')).toEqual([]);
    t.place('b', inside(X));
    t.advance(1000);
    t.place('b', SQUARE);
    t.advance(1000);
    await t.idle();
    expect(t.zoneRoom('b')).not.toBe(sq);
  });

  it('the audit strips an intruder before removing it', async () => {
    const t = setup();
    t.join('a', inside(X));
    t.want('a');
    await t.idle();
    const r0 = t.zoneRoom('a')!;
    t.place('a', SQUARE);
    t.advance(1000);
    await t.idle();
    t.livekit.set(r0, ['a']); // re-joined with its old token
    t.advance(16_000);
    await t.idle();
    const i = t.calls.indexOf(`update ${r0} a`);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t.calls.indexOf(`remove ${r0} a`, i)).toBeGreaterThan(i);
  });
});

// ---------------------------------------------------------------------------------------------
describe('VOICE-10: removal coalescing + retry', () => {
  it('door toggling does not turn into one LiveKit call per toggle; failures are retried', async () => {
    const t = setup({ limits: { maxPerLobby: 0 } });
    t.join('a');
    t.want('a');
    await t.idle();
    for (let i = 0; i < 20; i++) {
      t.place('a', i % 2 ? SQUARE : inside(X));
      t.host.clock.now += 100;
      t.voice.tick(t.host.clock.now);
    }
    await t.idle();
    const removes = t.calls.filter((c) => c.startsWith('remove')).length;
    // Rooms rotate as they empty, so each room name is removed at most once (+ coalesced repeats).
    expect(removes).toBeLessThanOrEqual(20);
    const t2 = setup();
    t2.join('b', inside(X));
    t2.want('b');
    await t2.idle();
    const r = t2.zoneRoom('b')!;
    t2.failRemovals(2);
    t2.place('b', SQUARE);
    t2.advance(1000);
    await t2.idle();
    expect(t2.removed).not.toContainEqual([r, 'b']);
    for (let i = 0; i < 12; i++) {
      t2.advance(1000);
      await t2.idle();
    }
    expect(t2.removed).toContainEqual([r, 'b']);
    expect(t2.calls.filter((c) => c === `remove ${r} b`)).toHaveLength(3);
  });
});

// VOICE-12 (static query strings) is tested in apps/server/test/staticQuery.test.ts (needs express).

// ---------------------------------------------------------------------------------------------
describe('live settings (admin settings registry hook)', () => {
  it('caps, idle limits and the monthly allowance are read live; bad values are clamped; env defaults otherwise', async () => {
    expect(voiceSettings(null)).toMatchObject({ maxConcurrent: 64, maxPerLobby: 16, maxPerIp: 4, idleMs: 20 * 60_000, alertWarnPct: 70, alertCriticalPct: 90 });
    setVoiceSettingsProvider(() => ({ monthlyMinutes: 5000 })); // no Services here: config default is absent
    const t = setup({ liveSettings: true });
    for (const p of ['a', 'b']) {
      t.join(p);
      t.want(p);
    }
    await t.idle();
    expect(t.zoneRoom('b')).not.toBeNull();
    setVoiceSettingsProvider(() => ({ monthlyMinutes: 5000, maxPerLobby: 1 }));
    t.join('c');
    t.want('c');
    await t.idle();
    expect(t.unavail('c').at(-1)?.reason).toBe('busy');
    setVoiceSettingsProvider(() => ({ monthlyMinutes: 0 })); // 0 = voice off via the allowance
    t.advance(3_000);
    await t.idle();
    expect(t.revokes('a').at(-1)?.reason).toBe('quota');
    setVoiceSettingsProvider(() => ({ maxPerLobby: -5, reconcileMs: 1, alertWarnPct: 95, alertCriticalPct: 50, alertWebhook: 'http://plain.example' }));
    expect(voiceSettings(null)).toMatchObject({ maxPerLobby: 0, reconcileMs: 15_000, alertWarnPct: 95, alertCriticalPct: 96, alertWebhook: null });
    setVoiceSettingsProvider(() => {
      throw new Error('registry broken');
    });
    expect(voiceSettings(null).maxPerLobby).toBe(16);
  });

  it('alert thresholds and webhook are read live', () => {
    let pct = 70;
    const a = createVoiceAlerts({ log, webhook: () => null, thresholds: () => ({ warnPct: pct, criticalPct: 95 }) });
    const base = { env: 'production', month: '2026-10', limit: 1000, liveParticipants: 0, maxConcurrent: 0 };
    expect(a.check({ ...base, minutes: 600 })).toEqual([]);
    pct = 50;
    expect(a.check({ ...base, minutes: 600 }).map((p) => p.level)).toEqual(['warn']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Storyteller announcement ends by itself (privacy fix, 2026-10-16)', () => {
  async function announcing() {
    const t = setup({ limits: { idleMs: 0, waitingMaxMs: 0 } });
    t.join('st', SQUARE, { role: 'storyteller' });
    t.join('p0', SQUARE, { seat: 0 });
    t.want('st');
    t.want('p0');
    t.setPhase('day');
    await t.idle();
    t.voice.handleAnnounce('st', { active: true });
    await t.idle();
    expect(t.voice.heldRooms('p0').announce).not.toBeNull();
    const msgs = (pid: string) => t.host.sent.get(pid) ?? [];
    const ended = (pid: string) => t.revokes(pid).filter((r) => r.purpose === 'announce' && r.reason === 'announce_end').length;
    const errors = (pid: string) => msgs(pid).filter((m) => m.type === 'error').map((m) => m.payload as { code: string });
    const stTalks = () => t.voice.handleStatus('st', { connected: true, publishing: true, room: t.zoneRoom('st')!, wanted: true });
    return { t, ended, errors, stTalks };
  }

  it('the client keep-alive does not keep it up: ends after 90 s without talking, and a keep-alive cannot restart it', async () => {
    const { t, ended } = await announcing();
    for (let i = 0; i < 4; i++) {
      t.advance(30_000);
      t.voice.handleAnnounce('st', { active: true }); // old client keep-alive
    }
    await t.idle();
    expect(ended('p0')).toBe(1);
    expect(t.voice.heldRooms('st').announce).toBeNull();
    t.advance(30_000);
    t.voice.handleAnnounce('st', { active: true }); // still blocked
    await t.idle();
    expect(t.voice.heldRooms('p0').announce).toBeNull();
    t.voice.handleAnnounce('st', { active: false }); // the ST switches it off -> may start again
    t.voice.handleAnnounce('st', { active: true });
    await t.idle();
    expect(t.voice.heldRooms('p0').announce).not.toBeNull();
  });

  it('talking keeps it up, but never longer than the hard cap (5 min)', async () => {
    const { t, ended, stTalks } = await announcing();
    for (let i = 0; i < 8; i++) {
      t.advance(30_000);
      stTalks();
    }
    expect(ended('p0')).toBe(0); // 4 min, talking
    for (let i = 0; i < 4; i++) {
      t.advance(30_000);
      stTalks();
    }
    await t.idle();
    expect(ended('p0')).toBe(1);
    expect(t.voice.heldRooms('st').announce).toBeNull();
  });

  it('nightfall ends it, and it cannot be started at night', async () => {
    const { t, ended, errors } = await announcing();
    t.setPhase('night');
    await t.idle();
    expect(ended('p0')).toBe(1);
    t.voice.handleAnnounce('st', { active: false });
    t.voice.handleAnnounce('st', { active: true });
    await t.idle();
    expect(t.voice.heldRooms('p0').announce).toBeNull();
    expect(errors('st').at(-1)?.code).toBe('phase');
  });

  it('a home visit ends it', async () => {
    const { t, ended } = await announcing();
    t.host.emit({ type: 'visit_changed', seat: 0 });
    await t.idle();
    expect(ended('p0')).toBe(1);
  });

  it('the cap is a live setting (voice.announceMaxMinutes)', async () => {
    setVoiceSettingsProvider(() => ({ monthlyMinutes: 5000, announceMaxMs: 60_000 }));
    const t = setup({ liveSettings: true });
    t.join('st', SQUARE, { role: 'storyteller' });
    t.join('p0', SQUARE, { seat: 0 });
    t.want('st');
    t.want('p0');
    t.setPhase('day');
    t.voice.handleAnnounce('st', { active: true });
    await t.idle();
    for (let i = 0; i < 3; i++) {
      t.advance(25_000);
      t.voice.handleStatus('st', { connected: true, publishing: true, room: t.zoneRoom('st')!, wanted: true });
    }
    await t.idle();
    expect(t.voice.heldRooms('p0').announce).toBeNull();
    expect(voiceSettings(null).announceMaxMs).toBe(60_000);
  });
});
