// M1: leave A / join B updates counts; stale seats expire; duplicate display names; SSE directory.
import { afterAll, describe, expect, it } from 'vitest';
import type { DirectoryEvent } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { fakeClientIp, pending } from '../support/features.js';
import { eventually, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

async function count(bot: Bot, lobbyId: string): Promise<number | undefined> {
  const r = await bot.api.getLobby(lobbyId);
  return r.status === 200 ? r.body.lobby.playerCount : undefined;
}

describe.skipIf(!features.rooms)(`lobby membership${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('leaving A and joining B updates both counts (API, lobby:view and SSE)', async () => {
    const [hA, hB, x, watcher] = await makeBots(4, uniq('mem-'), server.url, server.wsUrl);
    all.push(hA!, hB!, x!, watcher!);
    const A = await hA!.createLobby(uniq('A '), 6);
    const B = await hB!.createLobby(uniq('B '), 6);
    await hA!.join(A);
    await hB!.join(B);
    const sse = await watcher!.api.openDirectory();
    try {
      expect(sse.status).toBe(200);
      await sse.waitFor((e) => e.type === 'snapshot');

      await x!.join(A);
      await eventually(async () => (await count(x!, A)) === 2);
      await eventually(() => hA!.lobbyView?.members.length === 2);

      await x!.leave(true);
      await eventually(async () => (await count(hA!, A)) === 1, 5000);
      await eventually(() => hA!.lobbyView?.members.length === 1);
      await sse.waitFor((e: DirectoryEvent) => e.type === 'upsert' && e.lobby.id === A && e.lobby.playerCount === 1);

      await x!.join(B);
      await eventually(async () => (await count(x!, B)) === 2);
      await sse.waitFor((e: DirectoryEvent) => e.type === 'upsert' && e.lobby.id === B && e.lobby.playerCount === 2);
      expect(await count(x!, A)).toBe(1);
    } finally {
      sse.close();
    }
  });

  it('a waiting-room seat held by a dropped connection is released after the grace period (~30s)', async () => {
    const [h, x] = await makeBots(2, uniq('stale-'), server.url, server.wsUrl);
    all.push(h!, x!);
    const L = await h!.createLobby(uniq('Stale '), 5);
    await h!.join(L);
    await x!.join(L);
    await eventually(async () => (await count(h!, L)) === 2);
    await x!.drop();
    // Held during the grace window …
    await new Promise((r) => setTimeout(r, 2000));
    expect(await count(h!, L)).toBe(2);
    // … then released (architecture: 30 s in the waiting room).
    await eventually(async () => (await count(h!, L)) === 1, 40_000, 1000);
    await eventually(() => h!.lobbyView?.members.length === 1, 5000);
  }, 60_000);

  it('two members with the same display name get distinct pids', async () => {
    const name = uniq('Twin');
    const a = new Bot(name, server.url, server.wsUrl, { headers: { 'X-Forwarded-For': fakeClientIp() } });
    const b = new Bot(name, server.url, server.wsUrl, { headers: { 'X-Forwarded-For': fakeClientIp() } });
    all.push(a, b);
    await a.signUp();
    await b.signUp();
    const L = await a.createLobby(uniq('Twins '), 5);
    await a.join(L);
    await b.join(L);
    await eventually(() => a.lobbyView?.members.length === 2 && b.lobbyView?.members.length === 2);
    const pids = a.lobbyView!.members.map((m) => m.pid);
    expect(new Set(pids).size).toBe(2);
    expect(a.pid).not.toBe(b.pid);
  });

  it('rapid join/leave churn leaves consistent counts', async () => {
    const [h, ...churn] = await makeBots(5, uniq('churn-'), server.url, server.wsUrl);
    all.push(h!, ...churn);
    const L = await h!.createLobby(uniq('Churn '), 8);
    await h!.join(L);
    for (let round = 0; round < 3; round++) {
      await Promise.all(churn.map((b) => b.join(L)));
      await Promise.all(churn.map((b) => b.leave(true)));
    }
    await eventually(async () => (await count(h!, L)) === 1, 6000);
    await eventually(() => h!.lobbyView?.members.length === 1, 6000);
  });
});
