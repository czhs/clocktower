// Room-join tickets: single use, lobby-bound, tamper-proof, expiring; the Colyseus matchmaker
// cannot be used to bypass the directory (create/joinOrCreate/joinById without a ticket).
import { Client } from 'colyseus.js';
import { afterAll, describe, expect, it } from 'vitest';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

async function seated(b: Bot, roomId: string, ticket: string): Promise<boolean> {
  try {
    await b.joinWithTicket({ roomId, ticket });
    await b.waitFor('lobby:view', () => true, 3000);
    return true;
  } catch {
    await b.leave(false).catch(() => undefined);
    return false;
  }
}

describe.skipIf(!features.lobbies)(`matchmaker bypass${pending(features.lobbies, features.reasons.lobbies)}`, () => {
  it('clients cannot create rooms directly through the matchmaker', async () => {
    const c = new Client(server.wsUrl);
    await expect(c.create('game', { lobbyId: 'evil-lobby' })).rejects.toThrow();
    await expect(c.joinOrCreate('game', { lobbyId: 'evil-lobby2' })).rejects.toThrow();
    await expect(c.create('game', {})).rejects.toThrow();
  });

  it('joinById without a ticket / with garbage is rejected', async () => {
    const [h] = await makeBots(1, uniq('nt-'), server.url, server.wsUrl);
    all.push(h!);
    const L = await h!.createLobby(uniq('NoTicket '), 5);
    const t = await h!.getTicket(L);
    const c = new Client(server.wsUrl);
    await expect(c.joinById(t.roomId, {})).rejects.toThrow();
    await expect(c.joinById(t.roomId, { ticket: 'x'.repeat(40) })).rejects.toThrow();
    await expect(c.joinById(t.roomId, { ticket: 123 as unknown as string })).rejects.toThrow();
  });
});

describe.skipIf(!features.rooms)(`join tickets${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('a ticket is single-use', async () => {
    const [h, x] = await makeBots(2, uniq('reuse-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Reuse '), 5);
    const t = await x!.getTicket(L);
    expect(await seated(x!, t.roomId, t.ticket)).toBe(true);
    await x!.leave(true);
    const y = new Bot('replayer', server.url, server.wsUrl);
    expect(await seated(y, t.roomId, t.ticket)).toBe(false);
  });

  it("a ticket for lobby A is rejected by lobby B's room", async () => {
    const [hA, hB, x] = await makeBots(3, uniq('cross-'), server.url, server.wsUrl);
    all.push(hA!, hB!, x!);
    const A = await hA!.createLobby(uniq('CrossA '), 5);
    const B = await hB!.createLobby(uniq('CrossB '), 5);
    const tA = await x!.getTicket(A);
    const tB = await hB!.getTicket(B);
    expect(tA.roomId).not.toBe(tB.roomId);
    expect(await seated(x!, tB.roomId, tA.ticket)).toBe(false);
    // the ticket was not consumed by the failed attempt on B? Either way it must never seat x in B.
    const viewB = hB!.lobbyView;
    expect(viewB?.members.some((m) => m.displayName === x!.name) ?? false).toBe(false);
  });

  it('a tampered ticket is rejected', async () => {
    const [h, x] = await makeBots(2, uniq('tamper-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Tamper '), 5);
    const t = await x!.getTicket(L);
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    expect(await seated(x!, t.roomId, flip(t.ticket, t.ticket.length - 2))).toBe(false);
    expect(await seated(x!, t.roomId, flip(t.ticket, 3))).toBe(false);
  });

  it('an expired ticket is rejected (waits ~62s)', async () => {
    const [h, x] = await makeBots(2, uniq('exp-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Expire '), 5);
    const t = await x!.getTicket(L);
    expect(t.expiresAt - Date.now()).toBeLessThanOrEqual(61_000);
    await new Promise((r) => setTimeout(r, Math.max(0, t.expiresAt - Date.now()) + 1500));
    expect(await seated(x!, t.roomId, t.ticket)).toBe(false);
  }, 90_000);

  it('tickets for a lobby that does not exist are refused', async () => {
    const [x] = await makeBots(1, uniq('nolobby-'), server.url, server.wsUrl);
    all.push(x!);
    const r = await x!.api.ticket('zzzzzzzzzz');
    expect(r.status).toBe(404);
  });
});
