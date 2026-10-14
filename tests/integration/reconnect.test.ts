// M1: authenticated reconnect restores the same seat; duplicate-device policy (newest wins, 4002).
import { afterAll, describe, expect, it } from 'vitest';
import { CLOSE_CODES } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { fakeClientIp, pending } from '../support/features.js';
import { eventually, sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

describe.skipIf(!features.rooms)(`reconnection${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('Colyseus reconnection token restores the same pid', async () => {
    const [h, x] = await makeBots(2, uniq('rc-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('RC '), 5);
    await h!.join(L);
    await x!.join(L);
    await eventually(() => x!.pid && h!.lobbyView?.members.length === 2);
    const pid = x!.pid;
    await x!.drop();
    await sleep(500);
    await x!.reconnect();
    await eventually(() => x!.lobbyView?.youPid === pid, 5000);
    await eventually(() => h!.lobbyView?.members.length === 2 && h!.lobbyView.members.every((m) => m.connected), 5000);
  });

  it("a fresh 'reconnect' ticket maps the account back to its previous seat", async () => {
    const [h, x] = await makeBots(2, uniq('rt-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('RT '), 5);
    await h!.join(L);
    await x!.join(L);
    await eventually(() => x!.pid);
    const pid = x!.pid;
    await x!.drop();
    await sleep(300);
    const t = await x!.getTicket(L, 'reconnect');
    await x!.joinWithTicket(t);
    await eventually(() => x!.lobbyView?.youPid === pid, 5000);
    expect(h!.lobbyView?.members.filter((m) => m.pid === pid)).toHaveLength(1);
  });

  it('same account from a second device takes over the seat; the old socket closes with 4002', async () => {
    const [h, x] = await makeBots(2, uniq('dup-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Dup '), 5);
    await h!.join(L);
    await x!.join(L);
    await eventually(() => x!.pid);
    const pid = x!.pid;
    // second device: sign in with the passphrase in a fresh cookie jar
    const device2 = new Bot(x!.name, server.url, server.wsUrl, { headers: { 'X-Forwarded-For': fakeClientIp() } });
    all.push(device2);
    const si = await device2.api.signIn(x!.passphrase!);
    expect(si.status).toBe(200);
    expect(si.body.id).toBe(x!.accountId);
    await device2.join(L);
    await eventually(() => x!.lastCloseCode === CLOSE_CODES.replaced, 5000);
    await eventually(() => device2.lobbyView?.youPid === pid, 5000);
    await eventually(() => h!.lobbyView?.members.length === 2, 5000);
  });
});
