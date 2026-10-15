// OWNED BY world-audit. Night edge cases + night-visit secrecy through the REAL server: HTTP
// accounts/lobbies/tickets -> Colyseus GameRoom with the real Game/World/Voice modules ->
// colyseus.js clients (testkit). Voice is "configured" against an unreachable LiveKit so grants
// are minted locally and flow through the normal fan-out.
//
// Players walk with the client's own prediction algorithm (packages/assets/test/navsim.ts, a
// replica of TownScene.stepLocal) at the client's 15 Hz send rate, so these tests also check that
// the server's movement validation accepts realistic client movement (no rubber-band corrections).
import { townLayout as L } from '@ct/assets';
import { tileCenterPx, type CharacterId, type PlayerGameView, type StCommand, type StorytellerGameView, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameModule } from '../src/game/index.js';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';
import { bfs, lattice, pathTo, simulate, smooth, type Pt } from '../../../packages/assets/test/navsim.js';

const PORT = 3321; // world-audit range 3320-3329
const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'chef'];
let srv: TestServer;
const all: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 } },
    moduleFactories: { game: (host) => createGameModule(host, { seed: 5, bedtimeSeconds: 1, voteStepMs: 200 }) },
    env: {
      LOBBY_MAX_COUNT: '8',
      LIVEKIT_URL: 'ws://127.0.0.1:9',
      LIVEKIT_API_KEY: 'worldauditkey',
      LIVEKIT_API_SECRET: 'world-audit-secret-0123456789abcdef0123',
    },
  });
}, 30_000);

afterAll(async () => {
  await Promise.all(all.map((c) => c.leave(true)));
  await srv?.close();
}, 30_000);

interface P {
  seat: number;
  pid: string;
  cookie: string;
  c: TestClient;
  seq: number;
}

interface G {
  lobbyId: string;
  st: TestClient;
  stPid: string;
  players: P[];
}

const pv = (p: P) => p.c.last('game:view') as PlayerGameView;
const stv = (g: G) => g.st.last('game:view') as StorytellerGameView;
const lat = lattice(L);

async function cmd(g: G, c: StCommand, until: (v: StorytellerGameView) => boolean) {
  const errs = g.st.of('error').length;
  g.st.send('st:command', c);
  await waitFor(() => {
    const e = g.st.of('error').slice(errs).find((x) => x.for === 'st:command');
    if (e) throw new Error(`ST ${c.type} rejected: ${e.message}`);
    const v = stv(g);
    return v && until(v);
  }, 5000, `ST ${c.type}`);
}

async function newGame(prefix: string, beforeReady?: (joined: { cookie: string; c: TestClient }[]) => Promise<void>): Promise<G> {
  const host = await makeAccount(srv, `${prefix}-ST`);
  const lobby = await createLobby(srv, host.cookie, { name: `${prefix} town`, takeStoryteller: true });
  const st = await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', `${prefix}-ST`);
  all.push(st);
  const joined: { cookie: string; c: TestClient }[] = [];
  for (let i = 0; i < CHARS.length; i++) {
    const a = await makeAccount(srv, `${prefix}-P${i}`);
    const c = await TestClient.join(srv, a.cookie, lobby.id, 'player', `${prefix}-P${i}`);
    all.push(c);
    joined.push({ cookie: a.cookie, c });
  }
  await st.view((v) => v.members.length === CHARS.length + 1, 8000);
  await beforeReady?.(joined);
  for (const j of joined) j.c.send('lobby:ready', { ready: true });
  await st.view((v) => v.canStart, 8000);
  st.send('lobby:start', {});
  const players: P[] = [];
  for (const j of joined) {
    const v = (await j.c.waitMsg('game:view', (x) => x.kind === 'player', 8000)) as PlayerGameView;
    players.push({ seat: v.you.seat, pid: v.you.pid, cookie: j.cookie, c: j.c, seq: 0 });
  }
  players.sort((a, b) => a.seat - b.seat);
  const g: G = { lobbyId: lobby.id, st, stPid: st.pid!, players };
  await waitFor(() => stv(g)?.phase === 'setup', 5000, 'setup');
  await cmd(g, { type: 'assign_characters', assignments: CHARS.map((character, seat) => ({ seat, character })), demonBluffs: ['mayor', 'saint', 'monk'], allowNonstandard: true }, (v) => !!v.charactersAssigned);
  return g;
}

const lastTp = (p: P) => p.c.last('world:teleport') as WorldTeleport;
const myPos = (p: P) => {
  const s = p.c.last('world:snapshot') as WorldSnapshot | undefined;
  return s?.entities.find((e) => e.id === p.pid);
};

/** Walk like the client: predicted 60 fps steps, a `move` every 4th frame (15 Hz) in real time. */
async function walk(p: P, from: Pt, to: Pt): Promise<void> {
  const path = pathTo(lat, bfs(lat, from), to);
  if (!path) throw new Error(`no path ${from.x},${from.y} -> ${to.x},${to.y}`);
  const frames: { x: number; y: number; moving: boolean }[] = [];
  const res = simulate(L, smooth(L, path, 'keys'), {
    mode: 'keys',
    onFrame: (me, f, moving) => {
      if (f % 4 === 0 || !moving) frames.push({ x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, moving });
    },
  });
  if (!res.arrived) throw new Error('walk simulation got stuck');
  const corrections = p.c.of('world:teleport').filter((t) => t.reason === 'correction').length;
  for (const f of frames) {
    p.seq += 1;
    p.c.send('move', { seq: p.seq, x: f.x, y: f.y, facing: 'down', moving: f.moving });
    await sleep(1000 / 15);
  }
  await waitFor(() => {
    const s = p.c.last('world:snapshot') as WorldSnapshot | undefined;
    return s && s.ackSeq >= p.seq;
  }, 3000, 'move acked');
  expect(p.c.of('world:teleport').filter((t) => t.reason === 'correction').length, 'server corrected a realistic client walk').toBe(corrections);
  expect(myPos(p)).toMatchObject({ x: to.x, y: to.y });
}

const door = (id: string) => L.buildings.find((b) => b.id === id)!;

async function useDoor(p: P, id: string, expectLoc: string) {
  p.c.send('world:useDoor', { buildingId: id });
  const t = await p.c.waitMsg('world:teleport', (x) => x.reason === 'door' && x.location === expectLoc && x.seq === p.seq, 3000);
  expect(t.location).toBe(expectLoc);
}

/** Wait until only snapshots arrive for `ms`, then return the canonical (t-stripped) snapshot. */
const strip = (m: { type: string; payload: unknown }) => (m.type === 'world:snapshot' ? JSON.stringify({ ...(m.payload as WorldSnapshot), t: 0 }) : `${m.type} ${JSON.stringify(m.payload)}`);

describe('night edge cases through the real GameRoom (world-audit)', () => {
  it('first night: everyone home; ST visits (multi, mid-prompt) are invisible to everyone else; reconnect at night lands at home', async () => {
    const g = await newGame('Nite');
    await cmd(g, { type: 'begin_first_night' }, (v) => v.phase === 'first_night');
    for (const p of g.players) {
      await p.c.waitMsg('world:teleport', (t) => t.location === `bld:house-${p.seat}`, 5000);
      await waitFor(() => pv(p)?.phase === 'first_night', 3000, 'first_night view');
    }
    await sleep(400); // let voice grants / views settle
    const quietOnes = g.players.filter((p) => p.seat !== 1 && p.seat !== 2);

    // ---- quiet window
    const q0 = new Map(quietOnes.map((p) => [p.pid, p.c.messages.length]));
    const tq = Date.now();
    await sleep(1500);
    const quietDur = Date.now() - tq;
    const quiet = new Map(quietOnes.map((p) => [p.pid, p.c.messages.slice(q0.get(p.pid)!).map(strip)]));

    // ---- busy window: visit 1 (prompt, answer, resolve), visit 2 while 1's prompt is still open, leave
    const b0 = new Map(quietOnes.map((p) => [p.pid, p.c.messages.length]));
    const tb = Date.now();
    const p1 = g.players[1]!;
    const p2 = g.players[2]!;
    await cmd(g, { type: 'visit_home', seat: 1 }, (v) => v.visitingSeat === 1);
    await waitFor(() => pv(p1).storytellerVisitingYou, 3000, 'p1 sees the visit');
    await p1.c.waitMsg('sound', (s) => s.cue === 'visit');
    await waitFor(() => (p1.c.last('world:snapshot') as WorldSnapshot).entities.some((e) => e.id === g.stPid), 3000, 'ST in p1 snapshot');
    const poison = stv(g).nightQueue.find((s) => s.character === 'poisoner')!;
    await cmd(g, { type: 'prompt_player', seat: 1, prompt: poison.prompt! }, () => pv(p1).prompts.length > 0);
    await waitFor(() => pv(p1).prompts.length > 0, 3000, 'prompt reached p1');
    // ST walks over to seat 2 while seat 1 still has the prompt open (mid-prompt)
    await cmd(g, { type: 'visit_home', seat: 2 }, (v) => v.visitingSeat === 2);
    await waitFor(() => !pv(p1).storytellerVisitingYou && pv(p2).storytellerVisitingYou, 3000, 'visit moved to p2');
    await waitFor(() => !(p1.c.last('world:snapshot') as WorldSnapshot).entities.some((e) => e.id === g.stPid), 3000, 'ST gone from p1');
    expect(pv(p1).prompts.length).toBe(1); // the prompt survives the ST leaving
    const errs = p1.c.of('error').length;
    p1.c.send('game:promptResponse', { promptId: pv(p1).prompts[0]!.id, seats: [4] });
    await waitFor(() => stv(g).nightQueue.find((s) => s.id === poison.id)?.response !== undefined || p1.c.of('error').length > errs, 3000, 'answer recorded');
    expect(p1.c.of('error').slice(errs)).toEqual([]);
    await cmd(g, { type: 'resolve_step', stepId: poison.id }, (v) => v.nightQueue.find((s) => s.id === poison.id)?.status === 'resolved');
    await cmd(g, { type: 'visit_home', seat: 1 }, (v) => v.visitingSeat === 1); // back again
    await cmd(g, { type: 'leave_home' }, (v) => v.visitingSeat === null);
    await sleep(300);
    const busyDur = Date.now() - tb;
    const busy = new Map(quietOnes.map((p) => [p.pid, p.c.messages.slice(b0.get(p.pid)!).map(strip)]));

    for (const p of quietOnes) {
      const qs = quiet.get(p.pid)!;
      const bs = busy.get(p.pid)!;
      const canonical = qs[0]!;
      expect(canonical.startsWith('{')).toBe(true); // a world snapshot
      // nothing but identical snapshots in either window
      expect(new Set(qs), p.pid).toEqual(new Set([canonical]));
      expect(new Set(bs), p.pid).toEqual(new Set([canonical]));
      // and at the same fixed cadence (SNAPSHOT_HZ), independent of what the ST did
      const rq = qs.length / quietDur;
      const rb = bs.length / busyDur;
      expect(Math.abs(rb - rq) / rq, `${p.pid} snapshot rate`).toBeLessThan(0.3);
    }

    // ---- reconnect at night: drop seat 3, reconnect with a fresh ticket -> own home, own view only
    const p3 = g.players[3]!;
    p3.c.drop();
    await sleep(300);
    const fresh = await TestClient.join(srv, p3.cookie, g.lobbyId, 'reconnect', 'Nite-P3b');
    all.push(fresh);
    p3.c = fresh;
    const tp = await fresh.waitMsg('world:teleport', () => true, 5000);
    expect(tp.location).toBe(`bld:house-${p3.seat}`);
    const snap = await fresh.waitMsg('world:snapshot', () => true, 3000);
    expect(snap.entities.map((e) => e.id)).toEqual([p3.pid]);
    await waitFor(() => (fresh.last('game:view') as PlayerGameView | undefined)?.phase === 'first_night', 3000, 'view restored');
    // the reconnecting player is locked in too
    fresh.send('world:useDoor', { buildingId: `house-${p3.seat}` });
    await fresh.waitMsg('error', (e) => e.for === 'world:useDoor', 3000);
    expect(fresh.last('world:teleport')!.location).toBe(`bld:house-${p3.seat}`);

    // ---- dawn -> day: the ST is back at its spawn; doors unlock; a player walks out
    await cmd(g, { type: 'advance_phase', to: 'dawn' }, (v) => v.phase === 'dawn');
    await g.st.waitMsg('world:teleport', (t) => t.reason === 'dawn', 3000);
    const p0 = g.players[0]!;
    const h0 = door(`house-${p0.seat}`);
    // still locked at dawn
    await walk(p0, tileCenterPx(L, h0.bed!), tileCenterPx(L, h0.interiorDoor));
    const e0 = p0.c.of('error').length;
    p0.c.send('world:useDoor', { buildingId: h0.id });
    await waitFor(() => p0.c.of('error').length > e0, 3000, 'dawn door locked');
    await cmd(g, { type: 'advance_phase', to: 'day' }, (v) => v.phase === 'day');
    await waitFor(() => pv(p0).phase === 'day', 3000, 'day view');
    await useDoor(p0, h0.id, 'outdoors');
    const stEnt = await waitFor(() => (p0.c.last('world:snapshot') as WorldSnapshot).entities.find((e) => e.id === g.stPid), 3000, 'ST visible at day');
    const stSpawn = tileCenterPx(L, L.storytellerSpawn);
    expect(Math.abs(stEnt.x - stSpawn.x) <= 48 && Math.abs(stEnt.y - stSpawn.y) <= 32, `ST at ${stEnt.x},${stEnt.y}`).toBe(true);
    expect(stEnt.location).toBe('outdoors');
  }, 60_000);

  it('bedtime: a player who refuses to go home, and one inside someone else\'s cottage, are WALKED home when the countdown expires (gameplay: no teleport)', async () => {
    const g = await newGame('Bed');
    await cmd(g, { type: 'begin_first_night' }, (v) => v.phase === 'first_night');
    await cmd(g, { type: 'advance_phase', to: 'day' }, (v) => v.phase === 'day');
    const a = g.players.find((p) => p.seat === 0)!; // walks next door into house-1 and stays
    const b = g.players.find((p) => p.seat === 4)!; // walks out and loiters on the street
    await waitFor(() => pv(a).phase === 'day' && pv(b).phase === 'day', 3000, 'day');
    const h0 = door('house-0');
    const h1 = door('house-1');
    const h4 = door('house-4');
    await walk(a, tileCenterPx(L, h0.bed!), tileCenterPx(L, h0.interiorDoor));
    await useDoor(a, 'house-0', 'outdoors');
    await walk(a, tileCenterPx(L, h0.door), tileCenterPx(L, h1.door));
    await useDoor(a, 'house-1', 'bld:house-1');
    await walk(b, tileCenterPx(L, h4.bed!), tileCenterPx(L, h4.interiorDoor));
    await useDoor(b, 'house-4', 'outdoors');
    // bedtime (module option: 1 s countdown); nobody moves
    const na = a.c.of('world:teleport').length;
    const nb = b.c.of('world:teleport').length;
    await cmd(g, { type: 'advance_phase', to: 'bedtime' }, (v) => v.phase === 'bedtime');
    // Countdown over: the server escorts both (snapshot.you = auto) through the doors at walking
    // speed; the night falls once everyone is home. Nobody is teleported.
    await waitFor(() => stv(g).bedtimeOvertime === true, 6000, 'countdown expiry -> overtime');
    await waitFor(() => (a.c.last('world:snapshot') as WorldSnapshot).you?.mode === 'auto', 3000, 'a escorted');
    await waitFor(() => stv(g).phase === 'night', 60_000, 'everyone home -> night');
    const ta = a.c.of('world:teleport').slice(na);
    const tb = b.c.of('world:teleport').slice(nb);
    expect(ta.some((t) => t.reason === 'night' || t.reason === 'bedtime')).toBe(false);
    expect(tb.some((t) => t.reason === 'night' || t.reason === 'bedtime')).toBe(false);
    expect(ta.filter((t) => t.reason === 'door').map((t) => t.location).slice(-2)).toEqual(['outdoors', 'bld:house-0']);
    expect(tb.filter((t) => t.reason === 'door').at(-1)!.location).toBe('bld:house-4');
    // they end in bed (the walk finishes inside the home)
    await waitFor(() => {
      const ea = (a.c.last('world:snapshot') as WorldSnapshot).entities.find((e) => e.id === a.pid);
      const eb = (b.c.last('world:snapshot') as WorldSnapshot).entities.find((e) => e.id === b.pid);
      const ba = tileCenterPx(L, h0.bed!);
      const bb = tileCenterPx(L, h4.bed!);
      return ea && eb && Math.hypot(ea.x - ba.x, ea.y - ba.y) < 1 && Math.hypot(eb.x - bb.x, eb.y - bb.y) < 1 && !(a.c.last('world:snapshot') as WorldSnapshot).you;
    }, 10_000, 'in bed');
    // moving back outside is rejected
    b.seq += 1;
    const out = tileCenterPx(L, h4.door);
    b.c.send('move', { seq: b.seq, x: out.x, y: out.y, facing: 'down', moving: true });
    const corr = await b.c.waitMsg('world:teleport', (t) => t.reason === 'correction' && t.seq === b.seq, 3000);
    expect(corr.location).toBe('bld:house-4');
  }, 120_000);

  it('cosmetics: every client renders the same appearance inputs for a player, after a reconnect and after death', async () => {
    const look = { preset: null, skin: 'umber', hair: 'braid', hairColor: 'white', outfit: 'cleric', palette: 'plum', accessory: 'lantern', ghost: 'shroud' } as const;
    let firstPid = '';
    const g = await newGame('Cos', async (joined) => {
      joined[0]!.c.send('lobby:cosmetics', { cosmetics: look });
      firstPid = joined[0]!.c.pid!;
      await joined[0]!.c.view((v) => v.members.some((m) => m.pid === firstPid && m.cosmetics.accessory === 'lantern'));
    });
    const x = g.players.find((p) => p.pid === firstPid)!;
    // what each client feeds TownScene.kindFor: lobby member cosmetics + public alive flag
    const inputs = (c: TestClient, pid: string) => {
      const m = c.last('lobby:view')!.members.find((mm) => mm.pid === pid)!;
      const gv = c.last('game:view') as PlayerGameView | StorytellerGameView;
      return JSON.stringify({ cosmetics: m.cosmetics, role: m.role, name: m.displayName, alive: gv.players.find((p) => p.pid === pid)!.alive });
    };
    const expectSame = async (alive: boolean) => {
      const viewers = [g.st, ...g.players.map((p) => p.c)];
      await waitFor(() => viewers.every((c) => (c.last('game:view') as PlayerGameView | undefined)?.players.find((p) => p.pid === x.pid)?.alive === alive), 4000, `alive=${alive} everywhere`);
      const want = inputs(x.c, x.pid);
      expect(JSON.parse(want).cosmetics).toMatchObject(look);
      for (const c of viewers) expect(inputs(c, x.pid), c.name).toBe(want);
    };
    await cmd(g, { type: 'begin_first_night' }, (v) => v.phase === 'first_night');
    await cmd(g, { type: 'advance_phase', to: 'day' }, (v) => v.phase === 'day');
    await expectSame(true);
    // reconnect from a "new device" (fresh ticket): same cosmetics everywhere
    x.c.drop();
    await sleep(200);
    x.c = await TestClient.join(srv, x.cookie, g.lobbyId, 'reconnect', 'Cos-X2');
    all.push(x.c);
    await x.c.view((v) => v.members.length === CHARS.length + 1);
    await waitFor(() => x.c.last('game:view'), 3000, 'view after reconnect');
    await expectSame(true);
    // cosmetics are frozen in game: a change attempt is refused and nothing changes
    x.c.send('lobby:cosmetics', { cosmetics: { ...look, skin: 'fair' } });
    await x.c.waitMsg('error', (e) => e.for === 'lobby:cosmetics', 3000);
    // death (public): everyone switches to the ghost variant of the SAME cosmetics at once
    await cmd(g, { type: 'kill', seat: x.seat, announce: true }, (v) => v.players.find((p) => p.seat === x.seat)?.alive === false);
    await expectSame(false);
  }, 60_000);
});
