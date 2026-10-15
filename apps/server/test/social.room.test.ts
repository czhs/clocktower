// OWNED BY social-server. Wiring smoke test: the real GameRoom routes 'social:*' messages to the
// social module, snapshots carry pins (omitted only when empty), emotes reach co-located clients,
// and nothing social crosses lobbies.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '@ct/protocol';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3311;
let srv: TestServer;
const clients: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, { rateLimits: { ticket: { capacity: 100, refillPerSec: 100 } } });
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave(true)));
  await srv?.close();
});

async function lobby(prefix: string, n: number) {
  const host = await makeAccount(srv, `${prefix}-ST`);
  const l = await createLobby(srv, host.cookie, { name: `${prefix} town`, takeStoryteller: true });
  const st = await TestClient.join(srv, host.cookie, l.id, 'storyteller', `${prefix}-ST`);
  clients.push(st);
  const players: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const a = await makeAccount(srv, `${prefix}-${i}`);
    const c = await TestClient.join(srv, a.cookie, l.id, 'player', `${prefix}-${i}`);
    clients.push(c);
    players.push(c);
  }
  await st.view((v) => v.members.length === n + 1);
  return { st, players };
}

const lastSnap = (c: TestClient) => c.last('world:snapshot') as WorldSnapshot | undefined;

describe('GameRoom social wiring', () => {
  it('pins appear in snapshots of the same place, emotes reach those who see the emoter, nothing crosses lobbies', async () => {
    const A = await lobby('Ash', 2);
    const B = await lobby('Yew', 1);
    const [a0, a1] = A.players as [TestClient, TestClient];
    const me = await waitFor(() => lastSnap(a0)?.entities.find((e) => e.id === a0.pid), 3000, 'own entity');
    expect(lastSnap(a0)!.pins).toBeUndefined(); // no pins yet: omitted

    a0.send('social:pin', { target: { kind: 'place', x: me.x, y: me.y }, color: 'teal' });
    a0.send('social:emote', { kind: 'point', x: me.x, y: me.y });
    const pin = await waitFor(() => lastSnap(a1)?.pins?.[0], 3000, 'pin in a1 snapshot');
    expect(pin).toMatchObject({ by: a0.pid, color: 'teal', target: { kind: 'place' } });
    expect(typeof pin.character).toBe('string');
    await waitFor(() => lastSnap(A.st)?.pins?.length === 1, 3000, 'pin in ST snapshot');
    const ev = await a1.waitMsg('social:emote');
    expect(ev).toMatchObject({ pid: a0.pid, kind: 'point' });

    // A player cannot clear everyone's pins.
    a1.send('social:clearPins', { scope: 'all' });
    const err = await a1.waitMsg('error', (e) => e.for === 'social:clearPins');
    expect(err.code).toBe('forbidden');
    // The dropper removes it; snapshots go back to "no pins".
    a0.send('social:unpin', { id: pin.id });
    await waitFor(() => lastSnap(a1) && lastSnap(a1)!.pins === undefined, 3000, 'pin removed');

    await sleep(200);
    for (const c of [B.st, ...B.players]) {
      expect(c.of('social:emote'), c.name).toEqual([]);
      expect(c.of('world:snapshot').some((s) => s.pins !== undefined), c.name).toBe(false);
    }
    const errors = srv.log.lines.filter((l) => JSON.parse(l).level === 'error');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
