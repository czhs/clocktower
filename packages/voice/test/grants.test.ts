import { describe, expect, it } from 'vitest';
import {
  assertRoomInLobby,
  attenuationGain,
  buildUsageView,
  decodeJwtPayload,
  heartbeatCreditMs,
  livekitHttpUrl,
  MemoryVoiceUsageStore,
  mintVoiceToken,
  monthKeyUtc,
  parseRoomName,
  quotaLevel,
  roomNameFor,
  sessionMinutesFor,
  smoothGain,
  TokenVerifier,
} from '../src/index.js';

const KEY = 'APIfakeKey123';
const SECRET = 'fake-secret-fake-secret-fake-secret-0123456789';

describe('room naming', () => {
  it('formats <prefix>-<lobby>-<zone> and round-trips', () => {
    expect(roomNameFor('dev', 'abc123', 'square')).toBe('dev-abc123-square');
    expect(roomNameFor('prod', 'abc123', 'bld:house-4')).toBe('prod-abc123-bld-house-4');
    expect(parseRoomName('prod', 'prod-abc123-bld-house-4')).toEqual({ lobbyId: 'abc123', zone: 'bld:house-4' });
  });

  it('is injective for lobby ids containing - and _', () => {
    const a = roomNameFor('dev', 'ab-square', 'street');
    const b = roomNameFor('dev', 'ab', 'square');
    expect(a).not.toBe(b);
    expect(parseRoomName('dev', a)).toEqual({ lobbyId: 'ab-square', zone: 'street' });
    expect(roomNameFor('dev', 'a_d', 'street')).not.toBe(roomNameFor('dev', 'a-', 'street'));
    expect(parseRoomName('dev', roomNameFor('dev', 'x__y-z_', 'bld:tavern'))).toEqual({ lobbyId: 'x__y-z_', zone: 'bld:tavern' });
  });

  it('separates environments by prefix and rejects foreign rooms', () => {
    const prodRoom = roomNameFor('prod', 'L1', 'square');
    expect(parseRoomName('dev', prodRoom)).toBeNull();
    expect(() => assertRoomInLobby('dev', 'L1', prodRoom)).toThrow();
    expect(() => assertRoomInLobby('prod', 'L2', prodRoom)).toThrow();
    expect(() => assertRoomInLobby('prod', 'L1', prodRoom)).not.toThrow();
  });

  it('rejects zones without a room and unsafe ids', () => {
    expect(() => roomNameFor('dev', 'L1', 'none')).toThrow();
    expect(() => roomNameFor('dev', 'L1', 'bld:../x')).toThrow();
    expect(() => roomNameFor('Dev!', 'L1', 'square')).toThrow();
    expect(() => roomNameFor('dev', 'a b', 'square')).toThrow();
  });
});

describe('tokens', () => {
  it('grants exactly one room, mic-only publish, no data, short TTL, identity = pid', async () => {
    const room = roomNameFor('dev', 'L1', 'bld:house-2');
    const token = await mintVoiceToken({ apiKey: KEY, apiSecret: SECRET, identity: 'p_7', name: 'Ada', room, canPublish: true, ttlSec: 600 });
    const claims = await new TokenVerifier(KEY, SECRET).verify(token);
    expect(claims.sub).toBe('p_7');
    expect(claims.name).toBe('Ada');
    expect(claims.iss).toBe(KEY);
    expect((claims.exp as number) - (claims.nbf as number)).toBeLessThanOrEqual(600);
    const raw = decodeJwtPayload(token);
    expect(raw.video).toEqual({
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: ['microphone'],
    });
    expect(JSON.stringify(raw)).not.toContain(SECRET);
  });

  it('listen-only grant cannot publish', async () => {
    const token = await mintVoiceToken({ apiKey: KEY, apiSecret: SECRET, identity: 'p1', name: 'B', room: 'dev-L1-announce', canPublish: false });
    const v = decodeJwtPayload(token).video as Record<string, unknown>;
    expect(v.canPublish).toBe(false);
    expect(v.canPublishSources).toBeUndefined();
    expect(v.roomAdmin).toBeUndefined();
    expect(v.roomCreate).toBeUndefined();
    expect(v.roomList).toBeUndefined();
  });

  it('a token signed with another secret is rejected', async () => {
    const token = await mintVoiceToken({ apiKey: KEY, apiSecret: 'other-secret-other-secret-other-secret-xx', identity: 'p', name: 'n', room: 'dev-L1-square', canPublish: true });
    await expect(new TokenVerifier(KEY, SECRET).verify(token)).rejects.toThrow();
  });

  it('refuses to mint without credentials', async () => {
    await expect(mintVoiceToken({ apiKey: '', apiSecret: '', identity: 'p', name: 'n', room: 'r', canPublish: true })).rejects.toThrow();
  });

  it('converts ws urls to http for the server API', () => {
    expect(livekitHttpUrl('wss://x.livekit.cloud')).toBe('https://x.livekit.cloud');
    expect(livekitHttpUrl('ws://127.0.0.1:7880/')).toBe('http://127.0.0.1:7880');
  });
});

describe('attenuation', () => {
  it('full volume within 3 tiles, silent at 10 tiles, monotonic and smooth between', () => {
    expect(attenuationGain(0)).toBe(1);
    expect(attenuationGain(3 * 16)).toBe(1);
    expect(attenuationGain(10 * 16)).toBe(0);
    expect(attenuationGain(500)).toBe(0);
    expect(attenuationGain(Number.NaN)).toBe(0);
    let prev = 1;
    for (let d = 48; d <= 160; d += 1) {
      const g = attenuationGain(d);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - g).toBeLessThan(0.03); // no jumps (<3% per pixel)
      prev = g;
    }
    expect(attenuationGain(104)).toBeCloseTo(0.5, 5);
  });

  it('smoothGain converges without overshoot and is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = smoothGain(a, 1, 16, 150);
    let b = 0;
    for (let i = 0; i < 5; i++) b = smoothGain(b, 1, 32, 150);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0.6);
    expect(a).toBeLessThan(1);
    let c = 0;
    for (let i = 0; i < 200; i++) c = smoothGain(c, 1, 16, 150);
    expect(c).toBe(1);
  });
});

describe('quota math', () => {
  it('levels at 70 / 90 / 100 %', () => {
    expect(quotaLevel(0, 5000)).toBe('ok');
    expect(quotaLevel(3499, 5000)).toBe('ok');
    expect(quotaLevel(3500, 5000)).toBe('warn');
    expect(quotaLevel(4500, 5000)).toBe('critical');
    expect(quotaLevel(5000, 5000)).toBe('exhausted');
    expect(quotaLevel(0, 0)).toBe('exhausted');
  });

  it('participant-minutes budget: 16 participants on 5,000 min = 312.5 min of session time', () => {
    expect(sessionMinutesFor(5000, 16)).toBe(312.5);
  });

  it('heartbeat credit is capped and never negative', () => {
    expect(heartbeatCreditMs(30_000, 45_000)).toBe(30_000);
    expect(heartbeatCreditMs(3_600_000, 45_000)).toBe(45_000);
    expect(heartbeatCreditMs(-5, 45_000)).toBe(0);
    expect(heartbeatCreditMs(Number.NaN, 45_000)).toBe(0);
  });

  it('memory store aggregates per env and month; usage view rounds minutes', () => {
    const s = new MemoryVoiceUsageStore();
    const now = Date.UTC(2026, 9, 14);
    const m = monthKeyUtc(now);
    expect(m).toBe('2026-10');
    s.add('development', m, 60_000);
    s.add('production', m, 120_000);
    s.add('production', '2026-09', 999_999);
    s.add('production', m, -5);
    expect(s.get(m)).toEqual({ byEnv: { development: 60_000, production: 120_000 }, totalMs: 180_000 });
    const v = buildUsageView({ configured: true, now, store: s, monthlyLimit: 4, activeParticipants: 2 });
    expect(v).toEqual({ configured: true, month: '2026-10', participantMinutes: 3, monthlyLimit: 4, level: 'warn', activeParticipants: 2, byEnv: { development: 1, production: 2 } });
  });
});
