// Hostile clients: invalid / oversized / unknown / flooding C2S messages and privilege escalation
// attempts must not crash the room, affect other members, or change state. HTTP body limits.
import { afterAll, describe, expect, it } from 'vitest';
import { C2S } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { fakeClientIp, pending } from '../support/features.js';
import { ApiClient } from '../support/http.js';
import { eventually, sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

async function healthy() {
  const r = await fetch(`${server.url}/healthz`, { signal: AbortSignal.timeout(3000) });
  return r.status === 200;
}

const INVALID_PAYLOADS: unknown[] = [
  null,
  'string',
  42,
  [],
  { seq: -1, x: 'a', y: null },
  { x: Number.NaN, y: Number.POSITIVE_INFINITY, seq: 1, facing: 'north', moving: 'yes' },
  { text: 'x'.repeat(10_000) },
  { pid: { $ne: null } },
  { type: 'kill', seat: 999 },
  { __proto__: { admin: true }, constructor: { prototype: { polluted: true } } },
  { nested: JSON.parse('['.repeat(200) + ']'.repeat(200)) },
];

describe.skipIf(!features.accounts)(`HTTP input limits${pending(features.accounts, features.reasons.accounts)}`, () => {
  it('rejects oversized JSON bodies with 413 and invalid JSON / schema with 400', async () => {
    const c = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
    await c.createAccount(uniq('limits'));
    const big = await c.req('POST', '/api/lobbies', JSON.stringify({ name: 'big', maxPlayers: 5, description: 'x'.repeat(100_000) }));
    expect(big.status).toBe(413);
    expect((await c.req('POST', '/api/lobbies', '{"name": "broken", ')).status).toBe(400);
    expect((await c.req('POST', '/api/lobbies', { name: 'ok name', maxPlayers: 99 })).status).toBe(400);
    expect((await c.req('POST', '/api/lobbies', { name: 'ok name', maxPlayers: 4 })).status).toBe(400);
    expect((await c.req('POST', '/api/lobbies', { name: 'x'.repeat(500), maxPlayers: 5 })).status).toBe(400);
    expect((await c.req('POST', '/api/lobbies', { name: 'pw lobby', maxPlayers: 5, password: 'hunter2' })).status).not.toBe(500);
    expect(await healthy()).toBe(true);
  });
});

describe.skipIf(!features.rooms)(`hostile room messages${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('invalid payloads for every C2S type are rejected without side effects', async () => {
    const [host, attacker, witness] = await makeBots(3, uniq('inv-'), server.url, server.wsUrl);
    all.push(host!, attacker!, witness!);
    const L = await host!.createLobby(uniq('Invalid '), 5);
    for (const b of [host!, attacker!, witness!]) await b.join(L);
    await eventually(() => witness!.lobbyView?.members.length === 3);
    // The attacker itself may be disconnected/removed for abuse; everyone else must be unaffected.
    const others = () => JSON.stringify(witness!.lobbyView!.members.filter((m) => m.pid !== attacker!.pid).map((m) => [m.pid, m.role, m.isHost]));
    const before = others();

    for (const type of [...Object.keys(C2S), 'unknown:type', '__proto__', 'constructor']) {
      for (const p of INVALID_PAYLOADS) {
        try {
          attacker!.send(type, p);
        } catch {
          /* socket may have been closed by the server: acceptable */
        }
      }
      await sleep(20);
    }
    await sleep(1500);
    expect(await healthy()).toBe(true);
    // Other members unaffected: roles/host unchanged; witness still receives updates.
    expect(others()).toBe(before);
    witness!.send('lobby:ready', { ready: true });
    await eventually(() => host!.lobbyView?.members.find((m) => m.pid === witness!.pid)?.ready === true, 5000);
    // Rejections are reported (contract: 'error' {code:'invalid'|'rate_limited'}) or the socket is closed.
    const errs = attacker!.recorder.ofType<{ code: string }>('error');
    expect(errs.length > 0 || attacker!.lastCloseCode !== null).toBe(true);
    for (const e of errs) expect(['invalid', 'rate_limited', 'forbidden', 'phase', 'not_found']).toContain(e.code);
  });

  it('a multi-megabyte frame is refused and does not reach other members', async () => {
    const [host, attacker] = await makeBots(2, uniq('big-'), server.url, server.wsUrl);
    all.push(host!, attacker!);
    const L = await host!.createLobby(uniq('Big '), 5);
    await host!.join(L);
    await attacker!.join(L);
    const marker = uniq('HUGE');
    try {
      attacker!.send('chat:send', { text: marker + 'x'.repeat(4 * 1024 * 1024) });
    } catch {
      /* ignore */
    }
    await sleep(2000);
    expect(await healthy()).toBe(true);
    expect(host!.recorder.messages.some((m) => m.json.includes(marker))).toBe(false);
  });

  it('chat flooding is rate-limited', async () => {
    const [host, flooder] = await makeBots(2, uniq('flood-'), server.url, server.wsUrl);
    all.push(host!, flooder!);
    const L = await host!.createLobby(uniq('Flood '), 5);
    await host!.join(L);
    await flooder!.join(L);
    const tag = uniq('flood');
    for (let i = 0; i < 500; i++) {
      try {
        flooder!.send('chat:send', { text: `${tag} ${i}` });
      } catch {
        break;
      }
    }
    await sleep(3000);
    const delivered = host!.recorder.messages.filter((m) => m.type === 'chat:message' && m.json.includes(tag)).length;
    expect(await healthy()).toBe(true);
    expect(delivered).toBeLessThan(100);
  });

  it('non-host / non-storyteller privileged actions are refused', async () => {
    const [host, mallory, victim] = await makeBots(3, uniq('priv-'), server.url, server.wsUrl);
    all.push(host!, mallory!, victim!);
    const L = await host!.createLobby(uniq('Priv '), 5, true);
    await host!.join(L, 'storyteller');
    await mallory!.join(L);
    await victim!.join(L);
    await eventually(() => host!.lobbyView?.members.length === 3);
    const hostPid = host!.pid!;
    const malloryPid = mallory!.pid!;
    const victimPid = victim!.pid!;
    mallory!.send('lobby:kick', { pid: victimPid });
    mallory!.send('lobby:kick', { pid: hostPid });
    mallory!.send('lobby:transferHost', { pid: malloryPid });
    mallory!.send('lobby:transferStoryteller', { pid: malloryPid });
    mallory!.send('lobby:claimStoryteller', {});
    mallory!.send('lobby:settings', { name: 'pwned lobby', maxPlayers: 15 });
    mallory!.send('lobby:start', {});
    mallory!.send('st:command', { type: 'random_setup' });
    mallory!.send('st:command', { type: 'announce', text: 'I am the storyteller now' });
    mallory!.send('voice:announce', { active: true });
    await sleep(1500);
    const v = host!.lobbyView!;
    expect(v.members.map((m) => m.pid).sort()).toEqual([hostPid, malloryPid, victimPid].sort());
    expect(v.members.find((m) => m.pid === hostPid)!.isHost).toBe(true);
    expect(v.members.find((m) => m.pid === hostPid)!.role).toBe('storyteller');
    expect(v.members.find((m) => m.pid === malloryPid)!.role).toBe('player');
    expect(v.members.find((m) => m.pid === malloryPid)!.isHost).toBe(false);
    expect(v.lobby.name).not.toBe('pwned lobby');
    expect(v.lobby.phase).toBe('waiting');
    expect(victim!.lastCloseCode).toBeNull();
    expect(victim!.recorder.messages.some((m) => m.json.includes('I am the storyteller now'))).toBe(false);
    const errs = mallory!.recorder.ofType<{ code: string }>('error');
    expect(errs.some((e) => e.code === 'forbidden')).toBe(true);
  });
});
