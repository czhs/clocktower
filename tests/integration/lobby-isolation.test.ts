// M1: two lobbies exist simultaneously; occupants of A cannot see players, state or events of B.
import { afterAll, describe, expect, it } from 'vitest';
import type { LobbyRoomView, WorldSnapshot } from '../../packages/protocol/src/index.js';
import { makeBots, type Bot } from '../support/bot.js';
import { pending } from '../support/features.js';
import { findLeaks } from '../support/recorder.js';
import { eventually, sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

describe.skipIf(!features.rooms)(`two simultaneous lobbies are isolated${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('lobby views, chat, world snapshots and ids never cross lobbies', async () => {
    const tagA = uniq('alpha');
    const tagB = uniq('beta');
    const A = await makeBots(4, `${tagA}-`, server.url, server.wsUrl);
    const B = await makeBots(4, `${tagB}-`, server.url, server.wsUrl);
    all.push(...A, ...B);
    const lobbyA = await A[0]!.createLobby(`Lobby ${tagA}`, 8);
    const lobbyB = await B[0]!.createLobby(`Lobby ${tagB}`, 8);
    expect(lobbyA).not.toBe(lobbyB);
    for (const b of A) await b.join(lobbyA);
    for (const b of B) await b.join(lobbyB);

    for (const [bots, lobby] of [
      [A, lobbyA],
      [B, lobbyB],
    ] as const) {
      await eventually(() => bots.every((b) => b.lobbyView?.members.length === 4), 8000);
      for (const b of bots) {
        const v = b.lobbyView as LobbyRoomView;
        expect(v.lobby.id).toBe(lobby);
        expect(v.members.map((m) => m.displayName).sort()).toEqual(bots.map((x) => x.name).sort());
      }
    }

    // Everyone wanders; each side chats a unique secret.
    for (const b of [...A, ...B]) b.startWandering(10);
    const secretA = uniq('SECRET-A-');
    const secretB = uniq('SECRET-B-');
    A[1]!.send('chat:send', { text: secretA });
    B[1]!.send('chat:send', { text: secretB });
    await sleep(2500);
    for (const b of [...A, ...B]) b.stopActivity();

    // World snapshots only ever contain own-lobby pids.
    const pidsA = new Set(A.map((b) => b.pid));
    const pidsB = new Set(B.map((b) => b.pid));
    for (const [bots, own] of [
      [A, pidsA],
      [B, pidsB],
    ] as const) {
      for (const b of bots)
        for (const s of b.recorder.ofType<WorldSnapshot>('world:snapshot'))
          for (const e of s.entities) expect(own.has(e.id), `${b.name} saw foreign entity ${e.id}`).toBe(true);
    }

    // Nothing that identifies the other lobby (names, lobby id, account ids, chat secret) leaks.
    const needlesA = [lobbyA, tagA, secretA, ...A.map((b) => b.accountId!)];
    const needlesB = [lobbyB, tagB, secretB, ...B.map((b) => b.accountId!)];
    expect(findLeaks(B.map((b) => b.recorder), needlesA)).toEqual([]);
    expect(findLeaks(A.map((b) => b.recorder), needlesB)).toEqual([]);

    const chatDeliveredA = A.some((b) => b.recorder.messages.some((m) => m.type === 'chat:message' && m.json.includes(secretA)));
    if (!chatDeliveredA) console.warn('[lobby-isolation] chat:message not delivered inside lobby A — chat not implemented yet; cross-lobby chat check is vacuous');
  });

  it('directory lists both lobbies with independent counts', async () => {
    const [h1, h2, p] = await makeBots(3, uniq('dir-'), server.url, server.wsUrl);
    all.push(h1!, h2!, p!);
    const l1 = await h1!.createLobby(uniq('L1 '), 6);
    const l2 = await h2!.createLobby(uniq('L2 '), 6);
    await h1!.join(l1);
    await h2!.join(l2);
    await p!.join(l2);
    await eventually(async () => {
      const r = await p!.api.listLobbies();
      const s1 = r.body.lobbies.find((l) => l.id === l1);
      const s2 = r.body.lobbies.find((l) => l.id === l2);
      return s1?.playerCount === 1 && s2?.playerCount === 2;
    }, 6000);
  });
});
