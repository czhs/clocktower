// v2.3 security audit, area 2 (host safety), sec-host. Bounded probes against a throwaway server
// on 127.0.0.1:3380-3381 (temp DB, random secrets). Never touches prod/dev.
//
// Measurements are printed as `[HOST-PROBE] …` lines (copied into docs/security-v2.3/02-host-safety.md).
// Each test asserts the secure behaviour (phase B: HOST-07/08/09/11 fixed; the measurement tests
// print before/after numbers).
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Room } from 'colyseus.js';
import { ApiClient } from '../support/http.js';
import { Bot } from '../support/bot.js';
import { fakeClientIp } from '../support/ip.js';
import { pickPort, startServer, type TestServer } from '../support/server.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[HOST-PROBE]', ...a);

let server: TestServer;

beforeAll(async () => {
  // sec-host uses 3380 only (3381 is hardcoded by apps/server/test/playtest.gameplay.test.ts); other suites pick random ports in 3350-3389, so wait for it.
  let port = 0;
  for (let i = 0; i < 30 && !port; i++) port = await pickPort(3380, 3380).catch(() => sleep(1000).then(() => 0));
  server = await startServer({
    port,
    env: { NODE_ENV: 'production', APP_ENV: 'production', LOBBY_MAX_COUNT: '8' },
  });
}, 90_000);
afterAll(async () => {
  await server?.stop();
});

/** CPU seconds (user+sys) consumed so far by the server process. */
function cpuSec(pid: number): number {
  const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]!.split(' ');
  return (Number(f[11]) + Number(f[12])) / 100; // utime, stime (fields 14/15) at USER_HZ=100
}
function rssMiB(pid: number): number {
  const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
  return Math.round(Number(m?.[1] ?? 0) / 1024);
}

async function rawGet(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(server.url + path, { headers, signal: AbortSignal.timeout(5000) });
  return res.status;
}

describe('host safety: /internal and client-IP trust', () => {
  it('/internal/* answers a bare loopback request; /healthz is {ok:true} only (HOST-07)', async () => {
    expect(await rawGet('/internal/active-games')).toBe(200);
    expect(await rawGet('/internal/version')).toBe(200);
    const v = (await (await fetch(server.url + '/internal/version')).json()) as Record<string, unknown>;
    expect(v).toEqual({ ok: true, env: 'production', version: server.env.CT_VERSION });
    expect(await (await fetch(server.url + '/healthz')).json()).toEqual({ ok: true });
  });

  it('/internal/* refuses anything carrying proxy headers (as every tunnel request does)', async () => {
    const cases: Record<string, string>[] = [
      { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Forwarded-For': '::1' },
      { 'X-Forwarded-For': '127.0.0.1, 127.0.0.1' },
      { 'X-Forwarded-For': '' },
      { 'CF-Connecting-IP': '127.0.0.1' },
      { 'X-Forwarded-For': '203.0.113.9', 'CF-Connecting-IP': '203.0.113.9' },
      { Forwarded: 'for=203.0.113.9' },
    ];
    for (const path of ['/internal/active-games', '/internal/version']) {
      for (const h of cases) {
        const st = await rawGet(path, h);
        log(path, 'with', JSON.stringify(h), '->', st);
        // An empty XFF header is dropped by fetch() itself, so it arrives as a bare local request.
        if (h['X-Forwarded-For'] === '') continue;
        expect(st, `${path} ${JSON.stringify(h)}`).toBe(404);
      }
    }
  });

  it('per-IP buckets follow X-Forwarded-For from a loopback peer (safe only behind an APPENDING proxy)', async () => {
    // Same spoofed XFF: the 6th sign-up is limited (bucket 5).
    const same = fakeClientIp();
    const sameStatuses: number[] = [];
    for (let i = 0; i < 6; i++) sameStatuses.push((await new ApiClient(server.url, { 'X-Forwarded-For': same }).createAccount(`Same ${i}`)).status);
    // Rotating XFF from loopback: every request gets a fresh bucket.
    const rotStatuses: number[] = [];
    for (let i = 0; i < 6; i++) rotStatuses.push((await new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() }).createAccount(`Rot ${i}`)).status);
    // Through Cloudflare the edge APPENDS the real address, so the rightmost entry (the one
    // Express picks) is not client-controlled: `spoofed, real` -> real.
    const a = fakeClientIp();
    const appended: number[] = [];
    for (let i = 0; i < 6; i++) appended.push((await new ApiClient(server.url, { 'X-Forwarded-For': `${fakeClientIp()}, ${a}` }).createAccount(`App ${i}`)).status);
    log('createAccount same XFF', sameStatuses.join(','), '| rotating XFF', rotStatuses.join(','), '| spoofed-left + fixed-right', appended.join(','));
    expect(sameStatuses[5]).toBe(429);
    expect(appended[5]).toBe(429);
    expect(rotStatuses.every((s) => s === 201)).toBe(true); // documents the trust model (HOST-09)
  });
});

describe('host safety: connection-level resource use', () => {
  it('anonymous WebSocket upgrades (no seat reservation) are closed promptly', async () => {
    const N = 100;
    const before = rssMiB(server.pid);
    const sockets: WebSocket[] = [];
    let opened = 0;
    for (let i = 0; i < N; i++) {
      const ws = new WebSocket(`${server.wsUrl}/abcdefghi/xyzxyzxyz?sessionId=nope${i}`);
      ws.addEventListener('open', () => opened++);
      ws.addEventListener('error', () => undefined);
      sockets.push(ws);
    }
    await sleep(1500);
    const stillOpen = sockets.filter((s) => s.readyState === WebSocket.OPEN).length;
    log(`anonymous WS: ${N} attempted, ${opened} upgraded, ${stillOpen} still open after 1.5 s; server RSS ${before} -> ${rssMiB(server.pid)} MiB`);
    for (const s of sockets) s.close();
    expect(stillOpen).toBe(0);
  });

  it('idle TCP connections that never send a request (measurement; Node defaults apply)', async () => {
    const N = 200;
    const socks: net.Socket[] = [];
    for (let i = 0; i < N; i++) {
      const s = net.connect(server.port, '127.0.0.1');
      s.on('error', () => undefined);
      socks.push(s);
    }
    await sleep(2000);
    const open = socks.filter((s) => !s.destroyed && s.readyState === 'open').length;
    log(`idle TCP: ${open}/${N} connections from one address still open after 2 s (no per-IP cap, headersTimeout default 60 s)`);
    for (const s of socks) s.destroy();
    // Slow-header client: one byte every 2 s; Node's headersTimeout (60 s) is the only limit.
    expect(open).toBeGreaterThan(0);
  });
});

describe('host safety: a joined player flooding 24 KiB frames (HOST-11: pre-decode socket budget)', () => {
  let host: Bot;
  let hostRoom: Room;
  let lobbyId: string;

  beforeAll(async () => {
    host = await new Bot('Hostess', server.url, server.wsUrl, { record: false, headers: { 'X-Forwarded-For': fakeClientIp() } }).signUp();
    lobbyId = await host.createLobby('Flood test');
    hostRoom = await host.join(lobbyId);
    await sleep(300);
  }, 60_000);

  afterAll(async () => {
    await host?.leave().catch(() => undefined);
  });

  async function joiner(name: string): Promise<{ bot: Bot; room: Room; ws: RawWs; closed: Promise<number> }> {
    const bot = await new Bot(name, server.url, server.wsUrl, { record: false, headers: { 'X-Forwarded-For': fakeClientIp() } }).signUp();
    const room = await bot.join(lobbyId);
    const closed = new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));
    await sleep(300);
    return { bot, room, ws: (room as any).connection.transport.ws as RawWs, closed };
  }
  type RawWs = { readyState: number; bufferedAmount: number; send(b: Buffer): void };

  async function rtt(room: Room, n = 10): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      const got = new Promise<void>((resolve) => {
        const off = room.onMessage('pong', () => {
          off();
          resolve();
        });
      });
      room.send('ping', {});
      await Promise.race([got, sleep(3000)]);
      out.push(Math.round(performance.now() - t0));
      await sleep(50);
    }
    return out.sort((a, b) => a - b);
  }

  /** ROOM_DATA (13) + msgpack fixstr type + msgpack str32 payload of `bytes` ASCII chars. */
  function frame(type: string, bytes: number): Buffer {
    const t = Buffer.from(type);
    const head = Buffer.from([13, 0xa0 | t.length, ...t, 0xdb, 0, 0, 0, 0]);
    head.writeUInt32BE(bytes, head.length - 4);
    return Buffer.concat([head, Buffer.alloc(bytes, 0x61)]);
  }

  for (const type of ['chat:send', 'zz:unknown']) {
    it(`HOST-11: a 24 KiB '${type}' flood is cut off within 2 s with CLOSE_CODES.abuse, at little CPU cost`, async () => {
      const { ws, closed } = await joiner(`Flooder ${type.slice(0, 4)}`);
      const base = await rtt(hostRoom);
      const f = frame(type, 24 * 1024 - 32);
      const cpu0 = cpuSec(server.pid);
      const t0 = Date.now();
      let sent = 0;
      const rttDuring = rtt(hostRoom, 20);
      while (Date.now() - t0 < 3000 && ws.readyState === 1) {
        if (ws.bufferedAmount < 1 << 20) {
          ws.send(f);
          sent++;
        } else await sleep(1);
      }
      const code = await Promise.race([closed, sleep(3000).then(() => -1)]);
      const closedAfter = (Date.now() - t0) / 1000;
      const during = await rttDuring;
      await sleep(200);
      const cpu = cpuSec(server.pid) - cpu0;
      log(
        `flood '${type}' (with HOST-11 budget): ${sent} frames sent (${Math.round((sent * f.length) / 1048576)} MiB) before the socket closed; ` +
          `close code ${code} after ${closedAfter.toFixed(2)} s; server CPU ${cpu.toFixed(2)} s; RSS ${rssMiB(server.pid)} MiB; ` +
          `host ping p50/max baseline ${base[5]}/${base.at(-1)} ms, during ${during[10]}/${during.at(-1)} ms`,
      );
      expect(code).toBe(4105); // CLOSE_CODES.abuse
      expect(closedAfter).toBeLessThan(2.5);
      expect(cpu).toBeLessThan(1.5); // was ~2.8-3.2 CPU-s per 3 s before the fix
      expect((await fetch(`${server.url}/healthz`)).ok).toBe(true);
      expect(hostRoom.connection.isOpen).toBe(true);
    }, 60_000);
  }

  it('HOST-11: normal traffic (30 moves/s + a 20 KiB notebook-sized frame every second for 4 s) is not cut off', async () => {
    // (Kept within the per-type budgets, so sec-secrecy's SEC-7 violation score is not triggered either.)
    const { bot, room, ws, closed } = await joiner('Normal Nora');
    let code = 0;
    void closed.then((c) => (code = c));
    for (let i = 0; i < 50 && !bot.pos; i++) await sleep(100);
    const start = { ...(bot.pos ?? { x: 0, y: 0 }) };
    const big = frame('zz:nb', 20 * 1024);
    const t0 = Date.now();
    let lastBig = 0;
    let seq = 50_000;
    while (Date.now() - t0 < 4000) {
      bot.send('move', { seq: seq++, x: start.x + (seq % 2), y: start.y, facing: 'right', moving: true });
      if (Date.now() - lastBig >= 1000) {
        ws.send(big);
        lastBig = Date.now();
      }
      await sleep(1000 / 30);
    }
    await sleep(500);
    expect(code).toBe(0);
    expect(ws.readyState).toBe(1);
    await room.leave().catch(() => undefined);
  }, 30_000);

  it('a deeply nested msgpack payload is rejected without taking the process down', async () => {
    const { ws } = await joiner('Nester');
    const nested = Buffer.concat([Buffer.from([13, 0xa4, ...Buffer.from('move')]), Buffer.alloc(24_000, 0x91), Buffer.from([0xc0])]);
    if (ws.readyState === 1) ws.send(nested);
    await sleep(1000);
    log(`nested-array frame: socket ${ws.readyState === 1 ? 'still open' : 'closed'}; server alive=${(await fetch(`${server.url}/healthz`)).ok}`);
    expect((await fetch(`${server.url}/healthz`)).ok).toBe(true);
  }, 20_000);
});
