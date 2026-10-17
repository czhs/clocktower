// OWNED BY gameplay. B1 regression: a player refreshing (socket closed without consent, then the
// Colyseus reconnection token) while a vote is running must get views and snapshots again at once.
import type { PlayerGameView, WorldSnapshot } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameModule, type GameModuleOptions } from '../src/game/index.js';
import { sleep, startTestServer, waitFor } from '../src/rooms/testkit.js';
import { env, LIVEKIT_TEST_ENV, newGame, nominate, runNight, startGame, toDay } from './playtestHarness.js';

const PORT = 3384; // gameplay range 3380-3389

beforeAll(async () => {
  env.srv = await startTestServer(PORT, {
    rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 } },
    moduleFactories: {
      game: (host) => {
        const o: GameModuleOptions = { voteStepMs: 3000, bedtimeSeconds: 2 };
        env.optsByLobby.set(host.lobbyId, o);
        return createGameModule(host, o);
      },
    },
    env: { LOBBY_MAX_COUNT: '8', ...LIVEKIT_TEST_ENV },
  });
}, 30_000);
afterAll(async () => {
  const all = env.games.flatMap((g) => [g.st, ...g.players.map((p) => p.c)]);
  await Promise.all(all.map((c) => c.leave(true)));
  await env.srv?.close();
}, 30_000);

describe('refresh during a vote (B1)', () => {
  it('token reconnect mid-vote: game views and world snapshots resume within 1 s (x3)', async () => {
    const g = await newGame('Rfr', 5, 991, { voteStepMs: 3000 });
    await startGame(g, ['imp', 'poisoner', 'chef', 'empath', 'washerwoman']);
    await runNight(g);
    await toDay(g, false);
    await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => !!v.day?.nominationsOpen });
    for (let round = 0; round < 3; round++) {
      const nominee = round + 1;
      const id = await nominate(g, g.bySeat(round + 2), nominee);
      await g.cmd({ type: 'start_vote', nominationId: id }, { until: (v) => v.day?.nominations.find((n) => n.id === id)?.status === 'voting' });
      const p = g.bySeat(4 - round === nominee ? 0 : 4 - round);
      const token = p.c.room.reconnectionToken;
      p.c.drop(); // F5: socket closed without LEAVE_ROOM
      await waitFor(() => g.stView().players.find((x) => x.seat === p.seat)!.connected === false, 5000, 'drop seen');
      p.c.messages = [];
      await p.c.reconnectWithToken(env.srv, token);
      const t0 = Date.now();
      await waitFor(() => p.c.of('game:view').length > 0 && p.c.of('world:snapshot').length > 0, 1000, 'views + snapshots resume');
      const v = p.c.last('game:view') as PlayerGameView;
      expect(v.day?.nominations.find((n) => n.id === id)?.status).toBe('voting');
      // and they keep flowing (a few snapshots/second, the clock hand's view updates). (v2.2 WP4: the
      // compact stream sends 12 Hz only while something visible changes, else a 2 Hz keepalive.)
      await sleep(1500);
      expect(p.c.of('world:snapshot').length).toBeGreaterThanOrEqual(3);
      expect(Date.now() - t0).toBeLessThan(3000);
      // the player can still raise a hand
      p.c.send('game:vote', { nominationId: id, vote: true });
      await waitFor(() => (p.c.last('game:view') as PlayerGameView).day?.nominations.find((n) => n.id === id)?.handsRaised?.includes(p.seat) || (p.c.last('game:view') as PlayerGameView).day?.nominations.find((n) => n.id === id)?.votes[p.seat] !== undefined, 3000, 'hand raised after refresh');
      await g.cmd({ type: 'close_vote', mode: 'tally' }, { until: (vv) => vv.day?.nominations.find((n) => n.id === id)?.status === 'tallied' });
      expect((p.c.last('world:snapshot') as WorldSnapshot).entities.some((e) => e.id === p.pid)).toBe(true);
    }
  }, 120_000);
});
