// Smoke test: the GameRoom with the REAL Game/World/Voice module factories (other teams' code).
// Asserts only lobby-auth-owned guarantees: start works, per-client fan-out happens, nothing
// is broadcast across lobbies, and no module error is logged during the basic flow.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3334;
let srv: TestServer;
const clients: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, { rateLimits: { ticket: { capacity: 100, refillPerSec: 100 } } });
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave(true)));
  await srv?.close();
});

async function seat(prefix: string, n: number) {
  const host = await makeAccount(srv, `${prefix}-ST`);
  const lobby = await createLobby(srv, host.cookie, { name: `${prefix} town`, takeStoryteller: true });
  const st = await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', `${prefix}-ST`);
  clients.push(st);
  const players: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const a = await makeAccount(srv, `${prefix}-${i}`);
    const c = await TestClient.join(srv, a.cookie, lobby.id, 'player', `${prefix}-${i}`);
    clients.push(c);
    players.push(c);
  }
  await st.view((v) => v.members.length === n + 1);
  for (const p of players) p.send('lobby:ready', { ready: true });
  await st.view((v) => v.canStart, 5000);
  return { lobby, st, players };
}

describe('GameRoom with real gameplay modules (smoke)', () => {
  it('two lobbies start independently; every client gets its own snapshots/views', async () => {
    const A = await seat('Oak', 5);
    const B = await seat('Elm', 5);
    A.st.send('lobby:start', {});
    await A.st.view((v) => v.lobby.phase !== 'waiting', 5000);
    await sleep(600);
    for (const c of [A.st, ...A.players, B.st, ...B.players]) {
      expect(c.of('world:snapshot').length, c.name).toBeGreaterThan(0);
    }
    expect(B.st.last('lobby:view')!.lobby.phase).toBe('waiting');
    const pidsA = A.st.last('lobby:view')!.members.map((m) => m.pid);
    for (const c of [B.st, ...B.players]) {
      const dump = JSON.stringify(c.messages);
      for (const pid of pidsA) expect(dump).not.toContain(pid);
      expect(c.of('game:view')).toHaveLength(0);
    }
    // Game views (if the rules module produces them) are per-client: a player never receives
    // the Storyteller's view.
    for (const p of A.players) {
      for (const v of p.of('game:view') as unknown as { kind: string }[]) expect(v.kind).toBe('player');
    }
    const errors = srv.log.lines.filter((l) => JSON.parse(l).level === 'error');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
