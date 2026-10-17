// (v2.4 P3, perf server) Lobby create / dispose loop with the REAL modules and voice configured (the
// LiveKit URL is unreachable on purpose: listings fail fast). Guards against per-lobby leaks of the
// v2.3 process-wide state: live voice coordinators, the LiveKit usage reconciler (must stay ONE timer
// per process, not one per lobby), per-lobby moderation state, and pending timers in general.
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';
import { voiceProcessStats } from '../src/voice/index.js';

/** A free port in the shared random block (3400-3449; no test hardcodes it). */
async function freePort(): Promise<number> {
  for (let i = 0; i < 60; i++) {
    const p = 3400 + Math.floor(Math.random() * 50);
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.listen(p, '127.0.0.1', () => s.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port in 3400-3449');
}

let srv: TestServer;
const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

beforeAll(async () => {
  srv = await startTestServer(await freePort(), {
    env: {
      LOBBY_MAX_COUNT: '8',
      LIVEKIT_URL: 'ws://127.0.0.1:9',
      LIVEKIT_API_KEY: 'leakkey',
      LIVEKIT_API_SECRET: 'leak-secret-leak-secret-0123456789',
    },
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 }, ticket: { capacity: 100, refillPerSec: 100 } },
  });
  // An emptied waiting-room lobby is disposed after min(2 min, idle timeout): 1 s here.
  (srv.services.config as { lobbyIdleTimeoutSec: number }).lobbyIdleTimeoutSec = 1;
});
afterAll(async () => {
  await srv?.close();
});

/** Opens `n` lobbies at once (Storyteller + 2 players each), then everyone leaves; waits for disposal. */
async function cycle(prefix: string, n: number) {
  const lobbies = await Promise.all(
    Array.from({ length: n }, async (_, k) => {
      const host = await makeAccount(srv, `${prefix}${k}-ST`);
      const lobby = await createLobby(srv, host.cookie, { name: `${prefix}${k} town`, takeStoryteller: true });
      const clients = [await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', `${prefix}${k}-ST`)];
      for (let i = 0; i < 2; i++) {
        const a = await makeAccount(srv, `${prefix}${k}-${i}`);
        clients.push(await TestClient.join(srv, a.cookie, lobby.id, 'player', `${prefix}${k}-${i}`));
      }
      await clients[0]!.view((v) => v.members.filter((m) => m.connected).length === 3, 5000);
      return { lobby, clients };
    }),
  );
  expect(voiceProcessStats().coordinators).toBeGreaterThanOrEqual(n);
  await Promise.all(lobbies.flatMap((l) => l.clients.map((c) => c.leave(true))));
  await waitFor(() => lobbies.every((l) => srv.services.directory.get(l.lobby.id) === null), 10_000, `${prefix}: lobbies disposed`);
}

describe('lobby create/dispose loop: no per-lobby leaks (voice reconciler, alerts, moderation, timers)', () => {
  it('12 lobbies in 3 waves leave no coordinators, moderation states or extra timers behind; one reconciler', async () => {
    const before = timers();
    for (let w = 0; w < 3; w++) {
      await cycle(`Lk${w}x`, 4);
      await waitFor(() => voiceProcessStats().coordinators === 0, 5000, 'voice coordinators released');
      expect(srv.services.moderation.lobbyCount()).toBe(0);
      expect(srv.services.directory.list()).toEqual([]);
    }
    const s = voiceProcessStats();
    expect(s.reconciler).toBe(true); // started lazily with the first lobby, and only once
    expect(s.memberIps).toBe(0); // loopback joins are never keyed; nothing remembered
    // Ref'd timers (getActiveResourcesInfo lists only those): back to the pre-loop count (+2 slack for
    // Colyseus' own presence/matchmaking timers). The unref'd ones — the reconciler's single loop
    // timer and each disposed lobby's 10 s IP clean-up — are covered by voiceProcessStats() above.
    await waitFor(() => timers() <= before + 2, 15_000, `timers back to baseline (before ${before}, now ${timers()})`);
    await sleep(100);
  }, 60_000);
});
