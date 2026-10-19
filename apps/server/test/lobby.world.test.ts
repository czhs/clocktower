// (v3 WP0, v3-lead acting for lobby-auth) A lobby's world: chosen at creation (CreateLobbyRequest.world,
// default 'v2'), carried into the room (host.layout(), the lobby summary, every lobby:view) and immutable
// afterwards (lobby:settings has no world field). Since WP5a the v3 layout (Hollowmere) exists and v3 lobbies are
// created (before it, they were refused with 409; that path stays covered by worldAvailable/layoutForWorld below).
import { townLayout } from '@ct/assets';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import { CreateLobbyRequest } from '@ct/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createLobby, fakeModules, makeAccount, startTestServer, TestClient, api, type TestServer } from '../src/rooms/testkit.js';
import { LobbyDirectory } from '../src/directory/service.js';
import { createTicketService } from '../src/directory/tickets.js';
import { layoutForWorld, worldAvailable } from '../src/rooms/worldLayout.js';
import type { AccountRecord } from '@ct/db';

const PORT = 3454; // reserved for this suite in the v3-lead range (CLAUDE.md; 3450-3453 = ad-hoc v3-lead servers)
let srv: TestServer;
const fakes = fakeModules();
const open: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    env: { LOBBY_MAX_COUNT: '20' },
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 }, ticket: { capacity: 100, refillPerSec: 100 } },
  });
});
afterAll(async () => {
  await srv?.close();
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave(true)));
});

describe('world layouts', () => {
  it("'v2' (and absent) is the classic layout; 'v3' is Hollowmere (WP5a)", () => {
    expect(layoutForWorld(undefined)).toBe(townLayout);
    expect(layoutForWorld('v2')).toBe(townLayout);
    expect(worldAvailable('v2')).toBe(true);
    expect(worldAvailable('v3')).toBe(true);
    expect(layoutForWorld('v3')).toBe(townLayoutV3);
    expect(townLayoutV3).not.toBe(townLayout);
    expect(townLayoutV3.version).toBe(3);
  });

  it('CreateLobbyRequest accepts world v2 / v3 / absent and nothing else', () => {
    const base = { name: 'World lobby', maxPlayers: 5 };
    expect(CreateLobbyRequest.parse(base).world).toBeUndefined();
    expect(CreateLobbyRequest.parse({ ...base, world: 'v3' }).world).toBe('v3');
    expect(CreateLobbyRequest.safeParse({ ...base, world: 'v4' }).success).toBe(false);
  });
});

describe('LobbyDirectory (unit)', () => {
  const quiet = { debug() {}, info() {}, warn() {}, error() {} };
  const acct = (id: string): AccountRecord => ({ id, displayName: id, cosmetics: {} as AccountRecord['cosmetics'], createdAt: 0, lastSeenAt: 0 });
  const req = { name: 'Lobby', description: '', maxPlayers: 10, script: 'trouble-brewing' as const, takeStoryteller: false };
  const inits: Record<string, unknown> = {};
  const dir = (): LobbyDirectory => {
    const d: LobbyDirectory = new LobbyDirectory({
      log: quiet,
      tickets: createTicketService('k'.repeat(64)),
      lobbyMaxCount: 4,
      playerMaxPerLobby: 15,
      // as GameRoom.onCreate: the room takes its init while it is created
      createRoom: async (id) => {
        inits[id] = d.takeInit(id)?.world;
        return { roomId: `room-${id}` };
      },
    });
    return d;
  };

  it("records the world (default 'v2') in the summary and the room's init", async () => {
    const d = dir();
    const a = await d.create(acct('a'), req);
    expect(a.world).toBe('v2');
    expect(inits[a.id]).toBe('v2');
    const b = await d.create(acct('b'), { ...req, world: 'v2' });
    expect(b.world).toBe('v2');
    expect(inits[b.id]).toBe('v2');
  });

  it("creates a v3 lobby now that the v3 layout exists: summary and the room's init say 'v3'", async () => {
    const d = dir();
    const c = await d.create(acct('c'), { ...req, world: 'v3' });
    expect(c.world).toBe('v3');
    expect(inits[c.id]).toBe('v3');
    expect(d.size).toBe(1);
  });
});

describe('GameRoom', () => {
  it('a v2 lobby: host.layout() is the classic layout; summary + lobby:view carry the world; lobby:settings cannot change it', async () => {
    const host = await makeAccount(srv, 'world-host');
    const lobby = await createLobby(srv, host.cookie, { name: 'World test', maxPlayers: 5, takeStoryteller: true });
    expect(lobby.world).toBe('v2');
    const st = await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', 'world-host');
    open.push(st);
    const v = await st.view((x) => x.lobby.id === lobby.id);
    expect(v.world).toBe('v2');
    expect(v.lobby.world).toBe('v2');
    const g = fakes.registry.games.get(lobby.id) as unknown as { host: { layout(): unknown } };
    expect(g.host.layout()).toBe(townLayout);
    st.send('lobby:settings', { name: 'Renamed world', world: 'v3' } as never);
    const after = await st.view((x) => x.lobby.name === 'Renamed world');
    expect(after.world).toBe('v2');
    expect(after.lobby.world).toBe('v2');
  });

  it('POST /api/lobbies with world v3 creates a Hollowmere lobby: host.layout() is townLayoutV3, fixed for good', async () => {
    const host = await makeAccount(srv, 'world-host-2');
    const r = await api<{ lobby: { id: string; world?: string } }>(srv, 'POST', '/api/lobbies', {
      cookie: host.cookie,
      body: { name: 'V3 lobby', maxPlayers: 5, world: 'v3', takeStoryteller: true },
    });
    expect(r.status).toBe(201);
    const lobby = r.body.lobby;
    expect(lobby.world).toBe('v3');
    const st = await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', 'world-host-2');
    open.push(st);
    const v = await st.view((x) => x.lobby.id === lobby.id);
    expect(v.world).toBe('v3');
    expect(v.lobby.world).toBe('v3');
    const g = fakes.registry.games.get(lobby.id) as unknown as { host: { layout(): unknown } };
    expect(g.host.layout()).toBe(townLayoutV3);
    st.send('lobby:settings', { name: 'Renamed v3', world: 'v2' } as never);
    const after = await st.view((x) => x.lobby.name === 'Renamed v3');
    expect(after.world).toBe('v3');
    expect(after.lobby.world).toBe('v3');
  });
});
