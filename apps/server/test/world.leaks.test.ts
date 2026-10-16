// OWNED BY world-audit. Night-visit secrecy with the REAL Game + World + Voice modules wired
// through the in-memory RoomHost, deterministically (fake clock, fake LiveKit mint).
//
// The room's fan-out is replayed exactly: every "tick" each member gets a world snapshot
// (WorldModule.snapshotFor) and a game view only when its JSON changed (GameRoom.flushViews), and
// every direct host.send (teleports, sounds, voice grants/revokes, errors) lands in the same
// ordered per-member stream. Two runs that differ ONLY in what the Storyteller does at night
// (visits, prompts, info, walking around) must produce byte-identical streams for every player
// the ST did not visit (snapshot `t` zeroed).
// (v2.2, WP4) Each member's snapshots also go through a per-member SnapshotEncoder exactly as the
// room does for 'world:snap2' clients; those frames land in the same stream (before the snapshot of
// the same tick) and must be byte-identical too (they carry the real, deterministic fake-clock `t`).
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import type { CharacterId, PlayerGameView, StCommand, StorytellerGameView } from '@ct/protocol';
import { isBlockedPx, SnapshotEncoder, tileCenterPx } from '@ct/protocol';
import { MemoryVoiceUsageStore } from '@ct/voice';
import { createGameModule } from '../src/game/index.js';
import { createVoiceModule } from '../src/voice/index.js';
import { createWorldModule } from '../src/world/index.js';
import { createFakeHost } from './helpers/fakeHost.js';

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper'];
const N = CHARS.length;
const pids = CHARS.map((_, i) => `p${i}`);

type Step = (r: Rig) => void | Promise<void>;

interface Rig {
  st(cmd: StCommand): void;
  stView(): StorytellerGameView;
  view(seat: number): PlayerGameView;
  answer(seat: number, payload: { seats?: number[]; yes?: boolean }): void;
  world: ReturnType<typeof createWorldModule>;
  flush(): Promise<void>;
  streams(): Map<string, string[]>;
}

async function build(): Promise<Rig> {
  const host = createFakeHost('lobbyLeak');
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < N; i++) host.addMember({ pid: pids[i]!, displayName: `Player${i + 1}` });
  const game = createGameModule(host, { seed: 99, bedtimeSeconds: 30, voteStepMs: 100 });
  const world = createWorldModule(host);
  const voice = createVoiceModule(host, {
    livekit: { url: 'wss://leak-test.example', apiKey: 'leakkey', apiSecret: 'leak-secret-leak-secret-0123456789', roomPrefix: 'test', configured: true },
    mint: async (o) => `token:${o.identity}:${o.room}`,
    roomService: { removeParticipant: async () => undefined, listParticipants: async () => [] },
    usage: new MemoryVoiceUsageStore(),
    monthlyMinutes: 1_000_000,
    limits: { autoOptIn: true, idleMs: 0, waitingMaxMs: 0 }, // (v2.3 VOICE-4/7) grants for every member, as before
    roomEpochs: false, // (v2.3 VOICE-9) random room epochs would differ between the two compared runs
  });
  host.setModules({ game, world, voice });
  host.emit({ type: 'member_joined', pid: 'st' });
  host.emit({ type: 'role_changed', pid: 'st', role: 'storyteller' });
  for (const pid of pids) host.emit({ type: 'member_joined', pid });
  pids.forEach((pid, seat) => (host.member(pid)!.seat = seat));
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
  game.start(
    pids.map((pid, seat) => ({ pid, seat, name: `Player${seat + 1}` })),
    'st',
  );
  const lastView = new Map<string, string>();
  const encoders = new Map<string, SnapshotEncoder>();
  const push = (pid: string, type: string, payload: unknown) => {
    const list = host.sent.get(pid) ?? [];
    list.push({ type: type as never, payload: JSON.parse(JSON.stringify(payload)) });
    host.sent.set(pid, list);
  };
  const r: Rig = {
    world,
    st(cmd) {
      const before = (host.sent.get('st') ?? []).length;
      game.handleStoryteller('st', cmd);
      const errs = (host.sent.get('st') ?? []).slice(before).filter((m) => m.type === 'error');
      if (errs.length) throw new Error(`st ${cmd.type}: ${JSON.stringify(errs[0]!.payload)}`);
    },
    stView: () => game.viewFor('st') as StorytellerGameView,
    view: (seat) => game.viewFor(pids[seat]!) as PlayerGameView,
    answer(seat, payload) {
      const p = r.view(seat).prompts.at(-1)!;
      game.handlePlayer(pids[seat]!, 'game:promptResponse', { promptId: p.id, ...payload });
    },
    async flush() {
      host.clock.now += 100;
      game.tick(host.clock.now);
      world.tick(100);
      voice.tick(host.clock.now);
      await voice.whenIdle();
      for (const m of host.members()) {
        const v = game.viewFor(m.pid);
        const json = JSON.stringify(v);
        if (v && lastView.get(m.pid) !== json) {
          lastView.set(m.pid, json);
          push(m.pid, 'game:view', v);
        }
        const snap = world.snapshotFor(m.pid);
        const enc = encoders.get(m.pid) ?? encoders.set(m.pid, new SnapshotEncoder()).get(m.pid)!;
        const frame = enc.encode(snap);
        if (frame) push(m.pid, 'world:snap2', frame);
        push(m.pid, 'world:snapshot', { ...snap, t: 0 });
      }
    },
    streams() {
      const out = new Map<string, string[]>();
      for (const m of host.members()) out.set(m.pid, (host.sent.get(m.pid) ?? []).map((x) => `${x.type} ${JSON.stringify(x.payload)}`));
      return out;
    },
  };
  await r.flush();
  return r;
}

const noop: Step = () => undefined;

/** (v2.2 walkable interiors) A player takes a small step inside their own home at night (any free direction). */
const homeStep =
  (pid: string, seq: number): Step =>
  (r) => {
    const p = r.world.positionOf(pid)!;
    const to = [[4, 0], [-4, 0], [0, -4], [0, 4]].map(([dx, dy]) => ({ x: p.x + dx!, y: p.y + dy! })).find((q) => !isBlockedPx(townLayout, q.x, q.y))!;
    r.world.handleMove(pid, { seq, x: to.x, y: to.y, facing: 'left', moving: true });
  };

async function run(night: Step[]): Promise<Map<string, string[]>> {
  const r = await build();
  r.st({ type: 'assign_characters', assignments: CHARS.map((character, seat) => ({ seat, character })), redHerringSeat: 2, demonBluffs: ['chef', 'mayor', 'saint'] });
  await r.flush();
  r.st({ type: 'begin_first_night' });
  await r.flush();
  for (const s of night) {
    await s(r);
    await r.flush();
  }
  r.st({ type: 'advance_phase', to: 'dawn' });
  await r.flush();
  r.st({ type: 'advance_phase', to: 'day' });
  await r.flush();
  // daybreak: player 0 walks out of their cottage and looks around the town
  r.world.teleportToBuilding('p0', 'house-0', 'door');
  r.world.handleUseDoor('p0', { buildingId: 'house-0' });
  await r.flush();
  await r.flush();
  return r.streams();
}

const stepIdOf = (r: Rig, character: string) => r.stView().nightQueue.find((x) => x.character === character && x.status !== 'resolved' && x.status !== 'skipped')!.id;

/** The Storyteller's busy first night: walks, visits seat 1 (prompt -> answer -> resolve) and seat 2 (info), revisits, leaves. */
const busyNight: Step[] = [
  (r) => r.st({ type: 'set_travel_speed', mult: 3 }),
  (r) => {
    // physically walk a few steps outdoors first (ST is outdoors at night start)
    const p = r.world.positionOf('st')!;
    r.world.handleMove('st', { seq: 1, x: p.x + 6, y: p.y, facing: 'right', moving: true });
  },
  (r) => r.st({ type: 'visit_home', seat: 1 }),
  (r) => {
    const sv = r.stView().nightQueue.find((x) => x.id === stepIdOf(r, 'poisoner'))!;
    r.st({ type: 'prompt_player', seat: 1, prompt: sv.prompt! });
  },
  (r) => r.answer(1, { seats: [4] }),
  (r) => r.st({ type: 'resolve_step', stepId: stepIdOf(r, 'poisoner') }),
  (r) => r.st({ type: 'visit_home', seat: 2 }), // fast travel from house to house
  (r) => r.st({ type: 'send_info', seat: 2, info: { text: 'One of these is the Empath.', seats: [3, 5], characters: ['empath'], stepId: stepIdOf(r, 'washerwoman') } }),
  (r) => r.st({ type: 'leave_home' }),
  (r) => {
    // walk around on the doorstep of house 2
    const p = r.world.positionOf('st')!;
    r.world.handleMove('st', { seq: 2, x: p.x, y: p.y + 6, facing: 'up', moving: false });
  },
  (r) => r.st({ type: 'visit_home', seat: 1 }), // a second visit to the same home
  (r) => r.st({ type: 'prompt_player', seat: 1, prompt: { kind: 'acknowledge', title: 'Sleep well.' } }),
  (r) => r.st({ type: 'visit_home', seat: 2 }), // mid-prompt: leaves seat 1 with an open prompt
  homeStep('p1', 1), // (v2.2) the visited player walks about at home: only the ST (now away) and p1 may see it
  homeStep('p2', 1), // ... and the player the ST is with right now
  (r) => r.st({ type: 'set_travel_speed', mult: 1 }),
  homeStep('p3', 1), // a non-visited player walks about at home in both runs (identical, seen by nobody else)
  homeStep('p3', 2),
];
const quietNight: Step[] = busyNight.map((s, i) => (i >= busyNight.length - 2 ? s : noop));
const VISITED = new Set(['p1', 'p2']);

describe('night-visit secrecy with the real modules (world-audit)', () => {
  it('non-visited players receive byte-identical streams whether or not the ST visits / prompts / walks', async () => {
    const quiet = await run(quietNight);
    const busy = await run(busyNight);
    for (const pid of pids) {
      if (VISITED.has(pid)) continue;
      expect(busy.get(pid), pid).toEqual(quiet.get(pid));
    }
    // sanity: the visited players DID see something (cue, ST entity, prompt/info), the ST too
    for (const pid of VISITED) {
      expect(busy.get(pid)).not.toEqual(quiet.get(pid));
      expect(busy.get(pid)!.some((m) => m === 'sound {"cue":"visit"}')).toBe(true);
      expect(busy.get(pid)!.some((m) => m.startsWith('world:snapshot') && m.includes('"id":"st"'))).toBe(true);
      expect(busy.get(pid)!.some((m) => m.startsWith('world:snap2') && m.includes('"st"'))).toBe(true);
    }
    expect(quiet.get('p1')!.some((m) => m.includes('"cue":"visit"'))).toBe(false);
    // (v2.2) the in-house steps were real accepted moves (acked), not corrections
    for (const s of [quiet, busy]) expect(s.get('p3')!.some((m) => m.startsWith('world:snapshot') && m.includes('"ackSeq":2'))).toBe(true);
    expect(busy.get('p3')!.some((m) => m.includes('"reason":"correction"'))).toBe(false);
  });

  it('nothing a non-visited player receives during the night mentions the storyteller or a house other than their own', async () => {
    const busy = await run(busyNight);
    for (const pid of pids) {
      if (VISITED.has(pid)) continue;
      const seat = Number(pid.slice(1));
      const s = busy.get(pid)!;
      const nightStart = s.findIndex((m) => m.startsWith('game:view') && m.includes('"phase":"first_night"'));
      const dawn = s.findIndex((m) => m.startsWith('game:view') && m.includes('"phase":"dawn"'));
      expect(nightStart).toBeGreaterThan(0);
      for (const m of s.slice(nightStart, dawn)) {
        expect(m, pid).not.toContain('"id":"st"');
        if (m.startsWith('world:snap2')) expect(m, pid).not.toContain('"st"'); // compact frames: the id string table
        expect(m, pid).not.toContain('"cue":"visit"');
        expect(m.replaceAll(`house-${seat}`, ''), pid).not.toMatch(/house-\d/);
        expect(m, pid).not.toContain('"storytellerVisitingYou":true');
      }
    }
  });

  it('at daybreak everyone finds the storyteller at the same neutral spot (spawn), facing down', async () => {
    const busy = await run(busyNight);
    const s = busy.get('p0')!;
    const snap = JSON.parse(s.at(-1)!.slice('world:snapshot '.length)) as { entities: { id: string; x: number; y: number; facing: string; location: string }[] };
    const st = snap.entities.find((e) => e.id === 'st')!;
    const spawn = tileCenterPx(townLayout, townLayout.storytellerSpawn);
    expect(st).toMatchObject({ x: spawn.x, y: spawn.y, facing: 'down', location: 'outdoors' });
  });
});
