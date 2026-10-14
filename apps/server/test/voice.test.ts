// OWNED BY voice. VoiceCoordinator: zone grants, revocation, night isolation, announcements,
// quota, chat audience and cross-lobby / unauthorized-access security cases.
import { beforeEach, describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import type { GamePhase, LocationId, VoiceGrant, VoiceRevoke, VoiceUnavailable } from '@ct/protocol';
import { decodeJwtPayload, MemoryVoiceUsageStore, monthKeyUtc, parseRoomName, TokenVerifier, type VoiceUsageStore } from '@ct/voice';
import type { GameModule, Logger, WorldModule } from '../src/rooms/modules.js';
import { createVoiceModule } from '../src/voice/index.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

const KEY = 'APIvoiceTestKey';
const SECRET = 'voice-test-secret-voice-test-secret-0123456789';
const URL = 'wss://example-test.livekit.cloud';
const L = townLayout;
const TS = L.tileSize;
const sq = L.square;

type P = { x: number; y: number; location: LocationId };
const SQUARE: P = { x: sq.cx, y: sq.cy, location: 'outdoors' };
const SQUARE2: P = { x: sq.cx + TS, y: sq.cy + TS, location: 'outdoors' };
const street = (dx = 0, dy = 0): P => ({ x: sq.cx + sq.r + 4 * TS + dx, y: sq.cy + dy, location: 'outdoors' });
function inside(id: string): P {
  const b = L.buildings.find((bb) => bb.id === id);
  if (!b) throw new Error(`no building ${id}`);
  return { x: (b.interior.x + 2) * TS + 8, y: (b.interior.y + 2) * TS + 14, location: `bld:${id}` };
}
const houseOf = (seat: number) => L.buildings.find((b) => b.kind === 'house' && b.houseIndex === seat)!.id;
const otherBuilding = L.buildings.find((b) => b.kind !== 'house')!.id;

function fakeWorld() {
  const pos = new Map<string, P>();
  const w: WorldModule = {
    onEvent() {},
    handleMove() {},
    handleUseDoor() {},
    locationOf: (p) => pos.get(p)?.location ?? null,
    positionOf: (p) => {
      const q = pos.get(p);
      return q ? { x: q.x, y: q.y } : null;
    },
    snapshotFor: () => ({ t: 0, ackSeq: 0, entities: [] }),
    sendHome() {},
    teleportToBuilding() {},
    tick() {},
  };
  return { w, pos };
}

function fakeGame() {
  const s = { phase: null as GamePhase | null };
  const g: GameModule = {
    onEvent() {},
    start() {},
    handlePlayer() {},
    handleStoryteller() {},
    viewFor: () => null,
    phase: () => s.phase,
    directoryPhase: () => 'waiting',
    isAlive: () => true,
    seatOf: () => null,
    tick() {},
    outcome: () => null,
  };
  return { g, s };
}

function fakeRoomService() {
  const removed: [string, string][] = [];
  const participants = new Map<string, string[]>();
  return {
    removed,
    participants,
    listCalls: [] as string[],
    async removeParticipant(room: string, identity: string) {
      removed.push([room, identity]);
    },
    async listParticipants(room: string) {
      this.listCalls.push(room);
      return (participants.get(room) ?? []).map((identity) => ({ identity }));
    },
  };
}

interface SetupOpts {
  lobbyId?: string;
  configured?: boolean;
  prefix?: string;
  monthlyMinutes?: number;
  usage?: VoiceUsageStore;
  debounceMs?: number;
}

function setup(o: SetupOpts = {}) {
  const host = createFakeHost(o.lobbyId ?? 'lobbyA');
  const world = fakeWorld();
  const game = fakeGame();
  const rs = fakeRoomService();
  const usage = o.usage ?? new MemoryVoiceUsageStore();
  const configured = o.configured ?? true;
  const voice = createVoiceModule(host, {
    livekit: configured
      ? { url: URL, apiKey: KEY, apiSecret: SECRET, roomPrefix: o.prefix ?? 'dev', configured: true }
      : { url: '', apiKey: '', apiSecret: '', roomPrefix: o.prefix ?? 'dev', configured: false },
    monthlyMinutes: o.monthlyMinutes ?? 5000,
    usage,
    roomService: rs,
    layout: L,
    tuning: { zoneDebounceMs: o.debounceMs ?? 0 },
  });
  host.setModules({ world: world.w, game: game.g, voice });

  const join = (pid: string, p: P | null, extra: { role?: 'player' | 'storyteller'; seat?: number | null; displayName?: string } = {}) => {
    host.addMember({ pid, ...extra });
    if (p) world.pos.set(pid, p);
    host.emit({ type: 'member_joined', pid });
  };
  const place = (pid: string, p: P) => {
    const prev = world.pos.get(pid)?.location ?? null;
    world.pos.set(pid, p);
    if (prev !== p.location) host.emit({ type: 'location_changed', pid, location: p.location, prev });
  };
  const setPhase = (phase: GamePhase | null) => {
    const prev = game.s.phase;
    game.s.phase = phase;
    if (phase) host.emit({ type: 'phase_changed', phase, prev, phaseEndsAt: null });
  };
  const advance = (ms: number) => {
    host.clock.now += ms;
    voice.tick(host.clock.now);
  };
  const msgs = (pid: string) => host.sent.get(pid) ?? [];
  const grants = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:grant').map((m) => m.payload as VoiceGrant);
  const revokes = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:revoke').map((m) => m.payload as VoiceRevoke);
  const unavail = (pid: string) => msgs(pid).filter((m) => m.type === 'voice:unavailable').map((m) => m.payload as VoiceUnavailable);
  const lastGrant = (pid: string) => grants(pid).at(-1);
  const idle = () => voice.whenIdle();
  return { host, world, game, rs, usage, voice, join, place, setPhase, advance, msgs, grants, revokes, unavail, lastGrant, idle };
}

const verifier = new TokenVerifier(KEY, SECRET);

describe('voice: not configured', () => {
  it('sends voice:unavailable not_configured on join and never grants; chat scoping still works', async () => {
    const t = setup({ configured: false });
    t.join('a', SQUARE);
    t.join('b', SQUARE2);
    await t.idle();
    expect(t.unavail('a')).toEqual([{ reason: 'not_configured', message: expect.any(String) }]);
    expect(t.grants('a')).toEqual([]);
    expect(t.rs.removed).toEqual([]);
    expect(t.voice.audienceOf('a').sort()).toEqual(['a', 'b']);
  });
});

describe('voice: zone grants', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('square member receives a token restricted to exactly the lobby square room', async () => {
    t.join('a', SQUARE, { displayName: 'Ada' });
    await t.idle();
    const g = t.lastGrant('a')!;
    expect(g).toMatchObject({ provider: 'livekit', url: URL, room: 'dev-lobbyA-square', zone: 'square', mode: 'broadcast', purpose: 'zone', canPublish: true });
    const claims = await verifier.verify(g.token);
    expect(claims.sub).toBe('a');
    expect(claims.name).toBe('Ada');
    expect(claims.video).toEqual({
      roomJoin: true,
      room: 'dev-lobbyA-square',
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: ['microphone'],
    });
    expect((claims.exp as number) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
  });

  it('street = proximity, interior = private room', async () => {
    t.join('a', street());
    t.join('b', inside(otherBuilding));
    await t.idle();
    expect(t.lastGrant('a')).toMatchObject({ zone: 'street', mode: 'proximity', room: 'dev-lobbyA-street' });
    expect(t.lastGrant('b')).toMatchObject({ zone: `bld:${otherBuilding}`, mode: 'private', room: `dev-lobbyA-bld-${otherBuilding}` });
  });

  it('zone change revokes the old room server-side (removeParticipant) before granting the new one', async () => {
    t.join('a', SQUARE);
    await t.idle();
    t.place('a', inside(otherBuilding));
    await t.idle();
    expect(t.revokes('a')).toEqual([{ purpose: 'zone', room: 'dev-lobbyA-square', reason: 'zone_change' }]);
    expect(t.rs.removed).toContainEqual(['dev-lobbyA-square', 'a']);
    expect(t.lastGrant('a')!.room).toBe(`dev-lobbyA-bld-${otherBuilding}`);
    expect(t.voice.heldRooms('a')).toEqual({ zone: `dev-lobbyA-bld-${otherBuilding}`, announce: null });
    const types = t.msgs('a').map((m) => m.type);
    expect(types.lastIndexOf('voice:revoke')).toBeLessThan(types.lastIndexOf('voice:grant'));
  });

  it('a member never holds two zone rooms (message stream invariant over a random walk)', async () => {
    t.join('a', SQUARE);
    const spots = [SQUARE, street(), street(3 * TS), inside(otherBuilding), inside(houseOf(0)), SQUARE2, street(-TS, TS)];
    let seed = 7;
    for (let i = 0; i < 60; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      t.place('a', spots[seed % spots.length]!);
      t.advance(250);
      if (i % 5 === 0) t.setPhase((['day', 'bedtime', 'night', 'day'] as const)[i % 4]!);
      await t.idle();
    }
    let open: string | null = null;
    for (const m of t.msgs('a')) {
      if (m.type === 'voice:grant' && (m.payload as VoiceGrant).purpose === 'zone') {
        const room = (m.payload as VoiceGrant).room;
        expect(open === null || open === room).toBe(true);
        open = room;
      } else if (m.type === 'voice:revoke' && (m.payload as VoiceRevoke).purpose === 'zone') {
        // A revoke may name a room whose grant was superseded before delivery (harmless).
        if ((m.payload as VoiceRevoke).room === open) open = null;
      }
    }
  });

  it('square boundary: hysteresis + debounce, no flapping', async () => {
    const d = setup({ debounceMs: 600 });
    d.join('a', SQUARE);
    await d.idle();
    expect(d.grants('a')).toHaveLength(1);
    for (let i = 0; i < 40; i++) {
      d.world.pos.set('a', { x: sq.cx + sq.r + (i % 2 ? 10 : -10), y: sq.cy, location: 'outdoors' });
      d.advance(250);
    }
    await d.idle();
    expect(d.grants('a')).toHaveLength(1);
    expect(d.revokes('a')).toHaveLength(0);
    d.world.pos.set('a', street());
    d.advance(250);
    d.advance(250);
    expect(d.voice.zoneOf('a')).toBe('square'); // still debouncing
    d.advance(250);
    d.advance(250);
    await d.idle();
    expect(d.voice.zoneOf('a')).toBe('street');
    expect(d.lastGrant('a')!.room).toBe('dev-lobbyA-street');
  });

  it('reconnect re-delivers a fresh grant for the same room without revoking', async () => {
    t.join('a', SQUARE);
    await t.idle();
    t.host.member('a')!.connected = false;
    t.host.emit({ type: 'member_connection', pid: 'a', connected: false });
    t.host.member('a')!.connected = true;
    t.host.emit({ type: 'member_connection', pid: 'a', connected: true });
    await t.idle();
    expect(t.grants('a').map((g) => g.room)).toEqual(['dev-lobbyA-square', 'dev-lobbyA-square']);
    expect(t.revokes('a')).toEqual([]);
  });

  it('refreshes the token before it expires (same room, no revoke)', async () => {
    t.join('a', SQUARE);
    await t.idle();
    t.advance(9 * 60_000);
    await t.idle();
    expect(t.grants('a')).toHaveLength(2);
    expect(t.grants('a')[1]!.room).toBe('dev-lobbyA-square');
    expect(t.revokes('a')).toEqual([]);
  });

  it('member_left revokes and removes the participant', async () => {
    t.join('a', inside(otherBuilding));
    await t.idle();
    t.host.emit({ type: 'member_left', pid: 'a' });
    await t.idle();
    expect(t.rs.removed).toContainEqual([`dev-lobbyA-bld-${otherBuilding}`, 'a']);
    expect(t.voice.heldRooms('a')).toEqual({ zone: null, announce: null });
  });

  it('dispose removes every participant from LiveKit', async () => {
    t.join('a', SQUARE);
    t.join('b', inside(otherBuilding));
    await t.idle();
    await t.voice.dispose();
    expect(t.rs.removed).toEqual(expect.arrayContaining([['dev-lobbyA-square', 'a'], [`dev-lobbyA-bld-${otherBuilding}`, 'b']]));
  });
});

describe('voice: night isolation and Storyteller visits', () => {
  function night() {
    const t = setup();
    t.join('st', SQUARE, { role: 'storyteller' });
    t.join('p0', SQUARE, { seat: 0 });
    t.join('p1', street(), { seat: 1 });
    t.join('p2', inside(otherBuilding), { seat: 2 });
    t.setPhase('day');
    t.setPhase('night');
    // World moves everyone home at night.
    t.place('p0', inside(houseOf(0)));
    t.place('p1', inside(houseOf(1)));
    t.place('p2', inside(houseOf(2)));
    return t;
  }

  it('night puts every player in their own home room; storyteller outdoors has no room', async () => {
    const t = night();
    await t.idle();
    for (const s of [0, 1, 2]) {
      expect(t.lastGrant(`p${s}`)).toMatchObject({ room: `dev-lobbyA-bld-${houseOf(s)}`, mode: 'private' });
      expect(t.revokes(`p${s}`).at(-1)?.reason).toBe('phase');
    }
    expect(t.voice.heldRooms('st').zone).toBeNull();
    expect(t.rs.removed).toContainEqual(['dev-lobbyA-square', 'st']);
  });

  it('ST visit: only the ST receives voice messages; non-visited (and visited) players see nothing', async () => {
    const t = night();
    await t.idle();
    const before = new Map(['p0', 'p1', 'p2'].map((p) => [p, t.msgs(p).length]));
    t.place('st', inside(houseOf(1)));
    t.host.emit({ type: 'visit_changed', seat: 1 });
    await t.idle();
    expect(t.lastGrant('st')!.room).toBe(`dev-lobbyA-bld-${houseOf(1)}`);
    expect(t.voice.audienceOf('p1').sort()).toEqual(['p1', 'st']);
    expect(t.voice.audienceOf('p0')).toEqual(['p0']);
    // ST walks to another home: ST's own grant changes, nobody else gets anything.
    t.place('st', SQUARE);
    t.place('st', inside(houseOf(2)));
    t.host.emit({ type: 'visit_changed', seat: 2 });
    await t.idle();
    expect(t.rs.removed).toContainEqual([`dev-lobbyA-bld-${houseOf(1)}`, 'st']);
    for (const [p, n] of before) expect(t.msgs(p).length).toBe(n);
    expect(t.voice.heldRooms('p0').zone).toBe(`dev-lobbyA-bld-${houseOf(0)}`);
    expect(t.voice.heldRooms('p1').zone).toBe(`dev-lobbyA-bld-${houseOf(1)}`);
  });

  it("player stream is identical whether or not the ST visits someone else's home", async () => {
    const shape = (t: ReturnType<typeof setup>, pid: string) =>
      t.msgs(pid).map((m) => {
        const p = { ...(m.payload as Record<string, unknown>) };
        delete p.token;
        delete p.expiresAt;
        return { type: m.type, p };
      });
    const a = night();
    await a.idle();
    a.place('st', inside(houseOf(1)));
    a.advance(5000);
    await a.idle();
    const b = night();
    await b.idle();
    b.advance(5000);
    await b.idle();
    expect(shape(a, 'p0')).toEqual(shape(b, 'p0'));
    expect(shape(a, 'p2')).toEqual(shape(b, 'p2'));
  });

  it('dawn keeps players home; day restores the normal rules', async () => {
    const t = night();
    t.setPhase('dawn');
    await t.idle();
    expect(t.voice.zoneOf('p0')).toBe(`bld:${houseOf(0)}`);
    t.place('p0', SQUARE);
    t.setPhase('day');
    await t.idle();
    expect(t.voice.zoneOf('p0')).toBe('square');
  });
});

describe('voice: announcements', () => {
  it('only the storyteller may announce; players get forbidden and no grants', async () => {
    const t = setup();
    t.join('st', SQUARE, { role: 'storyteller' });
    t.join('p', SQUARE);
    await t.idle();
    t.voice.handleAnnounce('p', { active: true });
    await t.idle();
    expect(t.msgs('p').at(-1)).toMatchObject({ type: 'error', payload: { code: 'forbidden' } });
    expect(t.grants('p').filter((g) => g.purpose === 'announce')).toEqual([]);
    expect(t.grants('st').filter((g) => g.purpose === 'announce')).toEqual([]);
  });

  it('ST announce: everyone gets a listen-only announce grant, ST may publish; revoked on stop / idle', async () => {
    const t = setup();
    t.join('st', SQUARE, { role: 'storyteller' });
    t.join('p', inside(otherBuilding));
    await t.idle();
    t.voice.handleAnnounce('st', { active: true });
    await t.idle();
    const gp = t.grants('p').find((g) => g.purpose === 'announce')!;
    const gs = t.grants('st').find((g) => g.purpose === 'announce')!;
    expect(gp).toMatchObject({ room: 'dev-lobbyA-announce', canPublish: false, mode: 'broadcast' });
    expect(gs).toMatchObject({ room: 'dev-lobbyA-announce', canPublish: true });
    expect((decodeJwtPayload(gp.token).video as Record<string, unknown>).canPublish).toBe(false);
    expect((decodeJwtPayload(gs.token).video as Record<string, unknown>).canPublish).toBe(true);
    // Zone grant is untouched by the overlay.
    expect(t.voice.heldRooms('p')).toEqual({ zone: `dev-lobbyA-bld-${otherBuilding}`, announce: 'dev-lobbyA-announce' });
    t.voice.handleAnnounce('st', { active: false });
    await t.idle();
    expect(t.revokes('p').at(-1)).toEqual({ purpose: 'announce', room: 'dev-lobbyA-announce', reason: 'announce_end' });
    expect(t.rs.removed).toContainEqual(['dev-lobbyA-announce', 'p']);
    // Idle timeout.
    t.voice.handleAnnounce('st', { active: true });
    t.advance(60_000);
    expect(t.voice.heldRooms('p').announce).toBe('dev-lobbyA-announce');
    t.advance(31_000);
    await t.idle();
    expect(t.voice.heldRooms('p').announce).toBeNull();
  });
});

describe('voice: quota', () => {
  it('exhausted quota refuses new grants with voice:unavailable quota_exhausted', async () => {
    const usage = new MemoryVoiceUsageStore();
    const t = setup({ usage, monthlyMinutes: 10 });
    usage.add('production', monthKeyUtc(t.host.clock.now), 10 * 60_000);
    t.join('a', SQUARE);
    await t.idle();
    expect(t.grants('a')).toEqual([]);
    expect(t.unavail('a')).toEqual([{ reason: 'quota_exhausted', message: expect.any(String) }]);
  });

  it('heartbeats accumulate capped participant time only for granted rooms', async () => {
    const usage = new MemoryVoiceUsageStore();
    const t = setup({ usage, monthlyMinutes: 10 });
    const month = () => monthKeyUtc(t.host.clock.now);
    t.join('a', SQUARE);
    t.join('b', null); // no position -> no grant
    await t.idle();
    t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyA-square' });
    t.advance(30_000);
    t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyA-square' });
    expect(usage.get(month()).totalMs).toBe(30_000);
    t.advance(10 * 60_000);
    t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyA-square' });
    expect(usage.get(month()).totalMs).toBe(75_000); // capped at 45 s
    // Spoofed room / no grant: not counted, and resets the baseline.
    t.advance(30_000);
    t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyB-square' });
    t.advance(30_000);
    t.voice.handleStatus('b', { connected: true, publishing: false, room: 'dev-lobbyA-square' });
    t.advance(30_000);
    t.voice.handleStatus('b', { connected: true, publishing: false, room: 'dev-lobbyA-square' });
    // Rapid heartbeats cannot inflate beyond wall-clock time.
    t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyA-square' });
    for (let i = 0; i < 100; i++) t.voice.handleStatus('a', { connected: true, publishing: true, room: 'dev-lobbyA-square' });
    expect(usage.get(month()).totalMs).toBe(75_000);
    expect(usage.get(month()).byEnv).toEqual({ test: 75_000 });
  });

  it('once usage hits the limit, a zone change gets no new grant', async () => {
    const usage = new MemoryVoiceUsageStore();
    const t = setup({ usage, monthlyMinutes: 1 });
    t.join('a', SQUARE);
    await t.idle();
    expect(t.grants('a')).toHaveLength(1);
    usage.add('test', monthKeyUtc(t.host.clock.now), 60_000);
    t.advance(3000);
    t.place('a', inside(otherBuilding));
    await t.idle();
    expect(t.grants('a')).toHaveLength(1);
    expect(t.voice.heldRooms('a').zone).toBeNull(); // old room revoked, no new one
    expect(t.unavail('a').at(-1)?.reason).toBe('quota_exhausted');
  });
});

describe('voice: chat audience (audienceOf)', () => {
  it('square: everyone in the square; street: within the audible radius; building: same room', async () => {
    const t = setup();
    t.join('s1', SQUARE);
    t.join('s2', SQUARE2);
    t.join('n1', street());
    t.join('n2', street(5 * TS));
    t.join('n3', street(0, 15 * TS));
    t.join('b1', inside(otherBuilding));
    t.join('b2', inside(otherBuilding));
    t.join('h', inside(houseOf(0)));
    await t.idle();
    expect(t.voice.audienceOf('s1').sort()).toEqual(['s1', 's2']);
    expect(t.voice.audienceOf('n1').sort()).toEqual(['n1', 'n2']);
    expect(t.voice.audienceOf('n3')).toEqual(['n3']);
    expect(t.voice.audienceOf('b1').sort()).toEqual(['b1', 'b2']);
    expect(t.voice.audienceOf('h')).toEqual(['h']);
    expect(t.voice.audienceOf('ghost')).toEqual([]);
  });
});

describe('voice: security', () => {
  it('lobby A members never receive a token naming lobby B (and vice versa); prefixes separate envs', async () => {
    const a = setup({ lobbyId: 'ab' });
    const b = setup({ lobbyId: 'ab-square', prefix: 'prod' });
    for (const t of [a, b]) {
      t.join('x', SQUARE);
      t.join('y', street());
      t.join('z', inside(otherBuilding));
      t.voice.handleAnnounce('x', { active: true }); // not ST: refused
    }
    await a.idle();
    await b.idle();
    for (const [t, lobby, prefix] of [
      [a, 'ab', 'dev'],
      [b, 'ab-square', 'prod'],
    ] as const) {
      for (const pid of ['x', 'y', 'z']) {
        for (const g of t.grants(pid)) {
          const claims = await verifier.verify(g.token);
          const room = (claims.video as { room: string }).room;
          expect(room).toBe(g.room);
          expect(parseRoomName(prefix, room)?.lobbyId).toBe(lobby);
          expect(room.startsWith(`${prefix}-`)).toBe(true);
        }
      }
    }
    const roomsA = ['x', 'y', 'z'].flatMap((p) => a.grants(p).map((g) => g.room));
    const roomsB = ['x', 'y', 'z'].flatMap((p) => b.grants(p).map((g) => g.room));
    for (const r of roomsA) expect(roomsB).not.toContain(r);
    expect(roomsA).toContain('dev-ab-square');
    expect(roomsB).toContain('prod-ab_dsquare-square');
  });

  it('audit removes a revoked member who re-joins a private room with an old token', async () => {
    const t = setup();
    t.join('a', inside(otherBuilding));
    t.join('b', inside(otherBuilding));
    await t.idle();
    t.place('a', SQUARE);
    await t.idle();
    const room = `dev-lobbyA-bld-${otherBuilding}`;
    const removedBefore = t.rs.removed.length;
    // 'a' reconnects to the building room with the stale token; 'b' is legitimately there;
    // 'intruder' is not a member of this lobby at all.
    t.rs.participants.set(room, ['a', 'b', 'intruder']);
    t.advance(16_000);
    await t.idle();
    const newly = t.rs.removed.slice(removedBefore);
    expect(newly).toEqual(expect.arrayContaining([[room, 'a'], [room, 'intruder']]));
    expect(newly).not.toContainEqual([room, 'b']);
  });

  it('tokens and secrets never appear in logs', async () => {
    const t = setup();
    const lines: string[] = [];
    const log = (msg: string, data?: Record<string, unknown>) => lines.push(msg + JSON.stringify(data ?? {}));
    (t.host as { log: Logger }).log = { debug: log, info: log, warn: log, error: log };
    t.join('a', inside(otherBuilding));
    await t.idle();
    t.place('a', SQUARE);
    t.rs.participants.set(`dev-lobbyA-bld-${otherBuilding}`, ['a']);
    t.advance(16_000);
    await t.idle();
    const tokens = t.grants('a').map((g) => g.token);
    expect(lines.some((l) => l.includes('unauthorized'))).toBe(true);
    for (const l of lines) {
      expect(l).not.toContain(SECRET);
      for (const tok of tokens) expect(l).not.toContain(tok);
    }
  });
});
