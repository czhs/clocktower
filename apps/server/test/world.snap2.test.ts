// (v2.2 perf WP4) Compact world snapshots ('world:snap2') through the REAL server: HTTP accounts /
// lobbies / tickets -> GameRoom with the real Game/World modules -> colyseus.js clients (testkit).
//
// The world module is wrapped so the test sees every per-viewer snapshot the room computed (after
// pins were added). Each 'world:snap2' client's decoded stream must reproduce exactly those
// snapshots (frames that were skipped must equal the state the client holds), a legacy client in the
// same lobby keeps getting the old 'world:snapshot' at the same steady cadence, and delta state is
// per connection (reset on reconnect, format chosen per join).
import { townLayout as L } from '@ct/assets';
import { SNAP_DELTA, SNAP_KEY, SNAP_RESET, type CharacterId, type StCommand, type StorytellerGameView, type WorldSnapshot } from '@ct/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameModule } from '../src/game/index.js';
import { createWorldModule } from '../src/world/index.js';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3372; // perf-wp4 range 3370-3373
const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'chef'];
let srv: TestServer;
const all: TestClient[] = [];
/** pid -> every snapshot the room computed for that viewer, in order (objects as sent: pins included). */
const computed = new Map<string, WorldSnapshot[]>();

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 } },
    moduleFactories: {
      game: (host) => createGameModule(host, { seed: 7, bedtimeSeconds: 1, voteStepMs: 200 }),
      world: (host) => {
        const w = createWorldModule(host);
        const inner = w.snapshotFor.bind(w);
        w.snapshotFor = (pid) => {
          const s = inner(pid);
          (computed.get(pid) ?? computed.set(pid, []).get(pid)!).push(s);
          return s;
        };
        return w;
      },
    },
  });
}, 30_000);

afterAll(async () => {
  TestClient.snap2 = true;
  await Promise.all(all.map((c) => c.leave(true)));
  await srv?.close();
}, 30_000);

const canon = (s: WorldSnapshot | null | undefined) => JSON.stringify(s ? { ...s, t: 0 } : null);

/** The decoded stream of `c` reproduces exactly what the room computed for `pid` (from `fromT` on). */
function checkEquivalent(c: TestClient, pid: string, fromT: number) {
  // from the state the client held at fromT (frames are skipped while nothing changes)
  const mine = c.of('world:snapshot');
  const start = Math.max(0, mine.findLastIndex((s) => s.t <= fromT));
  const decoded = mine.slice(start);
  expect(decoded.length, c.name).toBeGreaterThan(1);
  const byT = new Map(decoded.map((s) => [s.t, s]));
  const lastT = decoded.at(-1)!.t;
  let held: WorldSnapshot | undefined;
  let skipped = 0;
  for (const s of computed.get(pid)!) {
    if (s.t < decoded[0]!.t || s.t > lastT) continue;
    const d = byT.get(s.t);
    if (d) {
      expect(JSON.stringify(d), `${c.name} @${s.t}`).toBe(JSON.stringify(s));
      held = d;
    } else {
      skipped++;
      expect(canon(s), `${c.name} skipped @${s.t} must equal the held state`).toBe(canon(held));
    }
  }
  for (const d of decoded) expect(computed.get(pid)!.some((s) => s.t === d.t), `${c.name} frame @${d.t} was computed`).toBe(true);
  return { frames: decoded.length, skipped };
}

describe('world:snap2 through the real GameRoom (perf WP4)', () => {
  it('decoded frames == the per-viewer snapshots; legacy clients unchanged; steady 12 Hz; reset per connection', async () => {
    const host = await makeAccount(srv, 'S2-ST');
    const lobby = await createLobby(srv, host.cookie, { name: 'Snap2 town', takeStoryteller: true });
    const st = await TestClient.join(srv, host.cookie, lobby.id, 'storyteller', 'S2-ST');
    all.push(st);
    const accts: { cookie: string }[] = [];
    const cs: TestClient[] = [];
    for (let i = 0; i < CHARS.length; i++) {
      const a = await makeAccount(srv, `S2-P${i}`);
      TestClient.snap2 = i !== 4; // the 5th player = an old tab (no capability)
      const c = await TestClient.join(srv, a.cookie, lobby.id, 'player', `S2-P${i}`);
      TestClient.snap2 = true;
      all.push(c);
      accts.push(a);
      cs.push(c);
    }
    await st.view((v) => v.members.length === CHARS.length + 1, 8000);
    for (const c of cs) c.send('lobby:ready', { ready: true });
    await st.view((v) => v.canStart, 8000);
    st.send('lobby:start', {});
    const seatOf = new Map<TestClient, number>();
    for (const c of cs) seatOf.set(c, ((await c.waitMsg('game:view', (x) => x.kind === 'player', 8000)) as { you: { seat: number } }).you.seat);
    const pidOf = (c: TestClient) => c.pid!;
    const stv = () => st.last('game:view') as StorytellerGameView;
    const cmd = async (c: StCommand, until: (v: StorytellerGameView) => boolean = () => true) => {
      const errs = st.of('error').length;
      st.send('st:command', c);
      await waitFor(() => {
        const e = st.of('error').slice(errs).find((x) => x.for === 'st:command');
        if (e) throw new Error(`ST ${c.type} rejected: ${e.message}`);
        const v = stv();
        return v && until(v);
      }, 5000, `ST ${c.type}`);
    };
    await waitFor(() => stv()?.phase === 'setup', 5000, 'setup');
    await cmd({ type: 'assign_characters', assignments: CHARS.map((character, seat) => ({ seat, character })), demonBluffs: ['mayor', 'saint', 'monk'], allowNonstandard: true }, (v) => !!v.charactersAssigned);
    await sleep(300);
    const t0 = Date.now();
    const legacy = cs[4]!;
    const a = cs.find((c) => c !== legacy && seatOf.get(c) !== undefined)!;
    const others = cs.filter((c) => c !== a && c !== legacy);
    const tavern = L.buildings.find((b) => b.kind === 'house' && b.houseIndex === 10)!; // nobody's home (5 seats)
    const house4 = L.buildings.find((b) => b.kind === 'house' && b.houseIndex === 4)!;

    // ---- a lot of per-viewer change: walks, a door (removal), pins, freeze / auto walk, door locks, ST teleports
    await cmd({ type: 'teleport', who: [seatOf.get(others[0]!)!], to: { kind: 'building', buildingId: tavern.id } });
    await waitFor(() => !(a.last('world:snapshot')?.entities ?? []).some((e) => e.id === pidOf(others[0]!)), 3000, 'went inside: gone for a');
    await waitFor(() => a.last('world:snapshot')?.doorTags?.[tavern.id]?.some((t) => t.pid === pidOf(others[0]!)), 3000, 'door tag');
    await cmd({ type: 'freeze', who: [seatOf.get(others[1]!)!], frozen: true });
    await waitFor(() => others[1]!.last('world:snapshot')?.you?.mode === 'frozen', 3000, 'frozen');
    await cmd({ type: 'walk_to', who: [seatOf.get(others[2]!)!], to: { kind: 'square' } });
    await waitFor(() => others[2]!.last('world:snapshot')?.you?.mode === 'auto', 3000, 'auto walk');
    const me = a.last('world:snapshot')!.entities.find((e) => e.id === pidOf(a))!;
    a.send('social:pin', { target: { kind: 'place', x: Math.round(me.x), y: Math.round(me.y) }, color: PIN_COLOR });
    await waitFor(() => (a.last('world:snapshot')?.pins ?? []).length > 0, 3000, 'pin');
    let seq = 0;
    for (let i = 0; i < 12; i++) {
      a.send('move', { seq: ++seq, x: me.x + i, y: me.y, facing: 'right', moving: i < 11 });
      await sleep(1000 / 15);
    }
    await waitFor(() => (a.last('world:snapshot')?.ackSeq ?? 0) >= seq, 3000, 'moves acked');
    await cmd({ type: 'door_lock', buildingId: tavern.id, lock: 'locked' });
    await waitFor(() => a.last('world:snapshot')?.doors?.[tavern.id] === true, 3000, 'door lock public');
    await cmd({ type: 'teleport_self', to: { kind: 'building', buildingId: house4.id } });
    await waitFor(() => !(a.last('world:snapshot')?.entities ?? []).some((e) => e.id === st.pid), 3000, 'ST gone inside');
    await cmd({ type: 'teleport_self', to: { kind: 'point', x: me.x + 40, y: me.y } });
    await waitFor(() => (a.last('world:snapshot')?.entities ?? []).some((e) => e.id === st.pid), 3000, 'ST back');
    await cmd({ type: 'door_lock', buildingId: tavern.id, lock: 'default' });
    await cmd({ type: 'freeze', who: [seatOf.get(others[1]!)!], frozen: false });
    await waitFor(() => !others[1]!.last('world:snapshot')?.you, 3000, 'unfrozen');
    a.send('social:clearPins', { scope: 'mine' });
    await waitFor(() => !a.last('world:snapshot')?.pins, 3000, 'pins cleared');

    // ---- stillness: only keyframes (1 Hz) + keepalives (2 Hz) for the compact clients, 12 Hz legacy
    await waitFor(() => !others[2]!.last('world:snapshot')?.you, 15_000, 'auto walk done');
    await sleep(300);
    const w0 = a.wire.length;
    const l0 = legacy.of('world:snapshot').length;
    const tw = Date.now();
    await sleep(3000);
    const secs = (Date.now() - tw) / 1000;
    const quiet = a.wire.slice(w0);
    expect(quiet.length / secs, 'compact frames/s while still').toBeLessThan(3);
    expect(quiet.length / secs, 'compact frames/s while still').toBeGreaterThan(1.5);
    expect(quiet.every((f) => f.payload[0] !== SNAP_DELTA || f.payload.length === 3), 'still: keepalives only').toBe(true);
    expect(quiet.some((f) => f.payload[0] === SNAP_KEY)).toBe(true);
    expect((legacy.of('world:snapshot').length - l0) / secs, 'legacy snapshots/s').toBeGreaterThan(10);

    // ---- equivalence for every viewer up to now
    for (const c of [st, ...cs.filter((c) => c !== legacy)]) {
      const r = checkEquivalent(c, pidOf(c), t0);
      expect(r.frames + r.skipped).toBeGreaterThan(50);
    }
    expect(legacy.wire.length).toBe(0);
    const lg = legacy.of('world:snapshot').filter((s) => s.t >= t0);
    const lc = computed.get(pidOf(legacy))!.filter((s) => s.t >= lg[0]!.t && s.t <= lg.at(-1)!.t);
    expect(lg.map((s) => JSON.stringify(s))).toEqual(lc.map((s) => JSON.stringify(s)));

    // ---- steady cadence: one snapshot every 83.3 ms (2 ticks at 24 Hz), no 50 ms beats
    const ts = computed.get(pidOf(a))!.filter((s) => s.t >= t0).map((s) => s.t);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]!).sort((x, y) => x - y);
    expect(gaps[Math.floor(gaps.length * 0.02)], 'no short beats').toBeGreaterThanOrEqual(70);
    expect(gaps[Math.floor(gaps.length / 2)], 'median interval').toBeLessThan(95);

    // ---- reconnect (token): the new connection starts over with SNAP_RESET, then deltas again
    const token = a.room.reconnectionToken;
    a.drop();
    await sleep(200);
    await a.reconnectWithToken(srv, token);
    const tr = Date.now();
    await waitFor(() => a.wire.length > w0 + quiet.length + 1 && a.last('world:snapshot')!.t >= tr, 5000, 'frames after reconnect');
    const firstAfter = a.wire.find((f, i) => i >= w0 + quiet.length && f.payload[0] === SNAP_RESET);
    expect(firstAfter, 'reset frame after reconnect').toBeTruthy();
    for (let i = 0; i < 12; i++) {
      a.send('move', { seq: ++seq, x: me.x + 11 - i, y: me.y, facing: 'left', moving: i < 11 });
      await sleep(1000 / 15);
    }
    await waitFor(() => (a.last('world:snapshot')?.ackSeq ?? 0) >= seq, 3000, 'moves acked after reconnect');
    await sleep(300);
    checkEquivalent(a, pidOf(a), tr);

    // ---- a fresh join decides the format: the same seat from an old tab gets 'world:snapshot' again
    TestClient.snap2 = false;
    const old = await TestClient.join(srv, accts[cs.indexOf(a)]!.cookie, lobby.id, 'reconnect', 'S2-old-tab');
    TestClient.snap2 = true;
    all.push(old);
    await old.waitMsg('world:snapshot', (s) => s.entities.some((e) => e.id === pidOf(a)), 3000);
    await sleep(300);
    expect(old.wire.length).toBe(0);

    // ---- night: per-viewer visibility shrinks to the own home (a keyframe), ST visit seen by one only
    await cmd({ type: 'begin_first_night' }, (v) => v.phase === 'first_night');
    const p1 = others[1]!; // (a's seat now belongs to the old tab)
    await waitFor(() => p1.last('world:snapshot')?.entities.every((e) => e.id === pidOf(p1)), 5000, 'p1 alone at night');
    const n0 = Date.now();
    const wn = new Map(cs.map((c) => [c, c.wire.length]));
    await cmd({ type: 'visit_home', seat: seatOf.get(p1)! }, (v) => v.visitingSeat === seatOf.get(p1));
    await waitFor(() => p1.last('world:snapshot')?.entities.some((e) => e.id === st.pid), 3000, 'ST visible in p1 home');
    await cmd({ type: 'leave_home' }, (v) => v.visitingSeat === null);
    await waitFor(() => !p1.last('world:snapshot')?.entities.some((e) => e.id === st.pid), 3000, 'ST left p1 home');
    await sleep(1200); // at least one keyframe for everyone
    for (const c of cs.filter((c) => c !== legacy && c !== a)) {
      checkEquivalent(c, pidOf(c), n0);
      if (c === p1) continue;
      for (const s of c.of('world:snapshot').filter((s) => s.t >= n0)) expect(s.entities.map((e) => e.id), c.name).toEqual([pidOf(c)]);
      for (const f of c.wire.slice(wn.get(c))) expect(JSON.stringify(f.payload)).not.toContain(`"${st.pid}"`);
    }
  }, 90_000);
});

const PIN_COLOR = 'gold' as const;
