import type { CharacterId, PlayerGameView, StCommand, StorytellerGameView } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { createGameModule } from '../src/game/index.js';
import type { GameModule, RoomEvent, WorldModule } from '../src/rooms/modules.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper'];

interface Rig {
  host: FakeHost;
  game: GameModule;
  world: { calls: string[] };
  st(cmd: StCommand): void;
  stView(): StorytellerGameView;
  view(seat: number): PlayerGameView;
  events(type: RoomEvent['type']): RoomEvent[];
  errors(pid: string): unknown[];
}

function rig(n = 8, opts: { withWorld?: boolean } = {}): Rig {
  const host = createFakeHost('lobbyA');
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < n; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `Player${i + 1}` });
  const game = createGameModule(host, { seed: 42, voteStepMs: 100, bedtimeSeconds: 30 });
  const calls: string[] = [];
  const world: WorldModule = {
    onEvent: () => undefined,
    handleMove: () => undefined,
    handleUseDoor: () => undefined,
    locationOf: () => null,
    positionOf: () => null,
    snapshotFor: () => ({ t: 0, ackSeq: 0, entities: [] }),
    sendHome: (pid, reason) => calls.push(`home:${pid}:${reason}`),
    teleportToBuilding: (pid, b, reason) => {
      calls.push(`tp:${pid}:${b}:${reason}`);
      host.emit({ type: 'location_changed', pid, location: `bld:${b}`, prev: 'outdoors' });
    },
    exitBuilding: (pid, reason) => {
      calls.push(`exit:${pid}:${reason}`);
      host.emit({ type: 'location_changed', pid, location: 'outdoors', prev: null });
    },
    tick: () => undefined,
  };
  host.setModules(opts.withWorld === false ? { game } : { game, world });
  game.start(
    Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, seat: i, name: `Player${i + 1}` })),
    'st',
  );
  const r: Rig = {
    host,
    game,
    world: { calls },
    st(cmd) {
      host.clock.now += 50;
      const before = (host.sent.get('st') ?? []).length;
      game.handleStoryteller('st', cmd);
      const errs = (host.sent.get('st') ?? []).slice(before).filter((m) => m.type === 'error');
      if (errs.length) throw new Error(`st ${cmd.type}: ${JSON.stringify(errs[0]!.payload)}`);
    },
    stView: () => game.viewFor('st') as StorytellerGameView,
    view: (seat) => game.viewFor(`p${seat}`) as PlayerGameView,
    events: (type) => host.events.filter((e) => e.type === type),
    errors: (pid) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'error').map((m) => m.payload),
  };
  return r;
}

function assign(r: Rig, chars = CHARS) {
  r.st({
    type: 'assign_characters',
    assignments: chars.map((character, seat) => ({ seat, character })),
    redHerringSeat: 2,
    demonBluffs: ['chef', 'mayor', 'saint'],
  });
}

function stepId(r: Rig, character: string) {
  const s = r.stView().nightQueue.find((x) => x.character === character && x.status !== 'resolved' && x.status !== 'skipped');
  if (!s) throw new Error(`no open ${character} step`);
  return s.id;
}

function answer(r: Rig, seat: number, seats: number[]) {
  const p = r.view(seat).prompts.at(-1)!;
  r.game.handlePlayer(`p${seat}`, 'game:promptResponse', { promptId: p.id, seats });
}

function promptAndResolve(r: Rig, character: string, seat: number, seats: number[]) {
  const id = stepId(r, character);
  const sv = r.stView().nightQueue.find((x) => x.id === id)!;
  r.st({ type: 'prompt_player', seat, prompt: sv.prompt! });
  answer(r, seat, seats);
  r.st({ type: 'resolve_step', stepId: id });
}

describe('GameModule authorisation', () => {
  it('rejects st:command from non-storytellers', () => {
    const r = rig();
    r.game.handleStoryteller('p0', { type: 'random_setup' });
    r.game.handleStoryteller('nobody', { type: 'declare_winner', winner: 'evil', reason: 'x' });
    expect(r.errors('p0')).toEqual([expect.objectContaining({ code: 'forbidden', for: 'st:command' })]);
    expect(r.stView().charactersAssigned).toBe(false);
    expect(r.game.phase()).toBe('setup');
  });

  it('rejects player actions from unseated members and in the wrong phase', () => {
    const r = rig();
    r.game.handlePlayer('st', 'game:nominate', { nomineeSeat: 1 });
    expect(r.errors('st')).toEqual([expect.objectContaining({ code: 'forbidden' })]);
    assign(r);
    r.st({ type: 'begin_first_night' });
    r.game.handlePlayer('p0', 'game:nominate', { nomineeSeat: 1 });
    expect(r.errors('p0')).toEqual([expect.objectContaining({ code: 'phase', for: 'game:nominate' })]);
  });

  it('serves the right projection per pid', () => {
    const r = rig();
    expect(r.game.viewFor('st')!.kind).toBe('storyteller');
    expect(r.game.viewFor('p3')!.kind).toBe('player');
    expect(r.game.viewFor('stranger')).toBeNull();
    expect(r.game.seatOf('p3')).toBe(3);
    expect(r.game.seatOf('st')).toBeNull();
    expect(r.game.directoryPhase()).toBe('starting');
    expect(r.events('phase_changed')).toEqual([{ type: 'phase_changed', phase: 'setup', prev: null, phaseEndsAt: null }]);
  });

  it('directoryPhase before start is waiting', () => {
    const host = createFakeHost();
    const game = createGameModule(host);
    expect(game.directoryPhase()).toBe('waiting');
    expect(game.viewFor('x')).toBeNull();
    expect(game.phase()).toBeNull();
    expect(game.outcome()).toBeNull();
  });
});

describe('scripted round through the module', () => {
  it('setup -> first night -> day -> vote/execute -> bedtime countdown -> night -> finish', () => {
    const r = rig();
    assign(r);
    r.st({ type: 'begin_first_night' });
    expect(r.game.phase()).toBe('first_night');
    expect(r.game.directoryPhase()).toBe('night');
    expect(r.world.calls.filter((c) => c.startsWith('home:'))).toHaveLength(8);
    expect(r.view(0).you.role).toEqual({ character: 'imp', characterType: 'demon', alignment: 'evil' });
    // night steps
    r.st({ type: 'resolve_step', stepId: stepId(r, 'minion_info') });
    r.st({ type: 'resolve_step', stepId: stepId(r, 'demon_info') });
    expect(r.view(1).you.evilTeam).toEqual({ demonSeats: [0], minionSeats: [1], bluffs: [] });
    promptAndResolve(r, 'poisoner', 1, [3]);
    const ww = r.stView().nightQueue.find((x) => x.character === 'washerwoman')!;
    r.st({ type: 'send_info', seat: 2, info: ww.suggestedInfo! });
    expect(r.view(2).info).toHaveLength(1);
    promptAndResolve(r, 'butler', 6, [4]);
    r.st({ type: 'advance_phase', to: 'dawn' });
    expect(r.game.directoryPhase()).toBe('day');
    r.st({ type: 'advance_phase', to: 'day' });
    expect(r.events('phase_changed').map((e) => (e as { phase: string }).phase)).toEqual(['setup', 'first_night', 'dawn', 'day']);
    // nominations & voting via player messages
    r.st({ type: 'set_nominations_open', open: true });
    r.game.handlePlayer('p2', 'game:nominate', { nomineeSeat: 1 });
    const nom = r.view(0).day!.nominations[0]!;
    r.st({ type: 'start_vote', nominationId: nom.id });
    for (const seat of [0, 2, 3, 4, 5]) r.game.handlePlayer(`p${seat}`, 'game:vote', { nominationId: nom.id, vote: true });
    for (let i = 0; i < 10; i++) {
      r.host.clock.now += 100;
      r.game.tick(r.host.clock.now);
    }
    const tallied = r.view(7).day!.nominations[0]!;
    expect(tallied.status).toBe('tallied');
    expect(tallied.voteCount).toBe(5);
    expect(r.view(7).day!.onTheBlock).toEqual({ seat: 1, votes: 5 });
    r.st({ type: 'execute', seat: 1 });
    expect(r.events('alive_changed')).toEqual([{ type: 'alive_changed', pid: 'p1', alive: false }]);
    expect(r.game.isAlive('p1')).toBe(false);
    // public announcement + toll reached everyone (including the ST)
    for (const pid of ['st', 'p0', 'p7'])
      expect((r.host.sent.get(pid) ?? []).some((m) => m.type === 'announcement' && JSON.stringify(m.payload).includes('executed'))).toBe(true);
    // bedtime countdown
    r.st({ type: 'advance_phase', to: 'bedtime' });
    const bed = r.events('phase_changed').at(-1) as Extract<RoomEvent, { type: 'phase_changed' }>;
    expect(bed.phase).toBe('bedtime');
    expect(bed.phaseEndsAt).toBe(r.host.clock.now + 30_000);
    expect(r.view(3).phaseEndsAt).toBe(bed.phaseEndsAt);
    r.game.tick(r.host.clock.now + 29_000);
    expect(r.game.phase()).toBe('bedtime');
    r.game.tick(r.host.clock.now + 30_000);
    expect(r.game.phase()).toBe('night');
    expect(r.world.calls.filter((c) => c.endsWith(':bedtime'))).toHaveLength(8);
    // night 2: imp kills the empath; publicly unknown until day
    promptAndResolve(r, 'imp', 0, [3]);
    expect(r.game.isAlive('p3')).toBe(true);
    expect(r.events('alive_changed')).toHaveLength(1);
    r.st({ type: 'advance_phase', to: 'day' });
    expect(r.game.isAlive('p3')).toBe(false);
    expect(r.events('alive_changed').at(-1)).toEqual({ type: 'alive_changed', pid: 'p3', alive: false });
    // slayer bluff, then execute the imp: good wins
    r.game.handlePlayer('p4', 'game:slayerShot', { targetSeat: 0 });
    expect(r.game.isAlive('p0')).toBe(true);
    r.st({ type: 'execute', seat: 0 });
    // The detected end waits for the ST's confirmation (nothing finished or recorded yet).
    expect(r.game.phase()).toBe('day');
    expect(r.game.outcome()).toBeNull();
    expect(r.events('game_finished')).toHaveLength(0);
    r.st({ type: 'confirm_result' });
    expect(r.game.phase()).toBe('finished');
    expect(r.events('game_finished')).toHaveLength(1);
    const out = r.game.outcome()!;
    expect(out.winner).toBe('good');
    expect(out.players.find((p) => p.pid === 'p2')!.nominationsMade).toBe(1);
    expect(out.players.find((p) => p.pid === 'p1')).toMatchObject({ executed: true, died: true, startingCharacter: 'poisoner' });
    expect(r.view(5).result!.reveal.map((x) => x.character)).toEqual(CHARS);
  });

  it('pauses the bedtime countdown while the storyteller is disconnected', () => {
    const r = rig();
    assign(r);
    r.st({ type: 'begin_first_night' });
    r.st({ type: 'advance_phase', to: 'day' });
    r.st({ type: 'advance_phase', to: 'bedtime' });
    const t0 = r.host.clock.now;
    r.host.member('st')!.connected = false;
    r.host.emit({ type: 'member_connection', pid: 'st', connected: false });
    expect(r.stView().timerPaused).toBe(true);
    r.game.tick(t0 + 120_000);
    expect(r.game.phase()).toBe('bedtime');
    r.host.clock.now = t0 + 200_000;
    r.host.member('st')!.connected = true;
    r.host.emit({ type: 'member_connection', pid: 'st', connected: true });
    expect(r.view(0).phaseEndsAt).toBe(t0 + 230_000);
    r.game.tick(t0 + 229_999);
    expect(r.game.phase()).toBe('bedtime');
    r.game.tick(t0 + 230_000);
    expect(r.game.phase()).toBe('night');
  });

  it('player disconnects are reflected publicly', () => {
    const r = rig();
    r.host.emit({ type: 'member_connection', pid: 'p4', connected: false });
    expect(r.view(0).players[4]!.connected).toBe(false);
  });

  it('travel speed emits a travel_speed event for the ST', () => {
    const r = rig();
    r.st({ type: 'set_travel_speed', mult: 3 });
    expect(r.events('travel_speed')).toEqual([{ type: 'travel_speed', pid: 'st', mult: 3 }]);
    expect(r.stView().travelSpeedMult).toBe(3);
  });
});

describe('night visits', () => {
  function toNight2(r: Rig) {
    assign(r);
    r.st({ type: 'begin_first_night' });
    r.st({ type: 'advance_phase', to: 'day' });
    r.st({ type: 'advance_phase', to: 'night' });
  }

  it('visit_home fast-travels the ST; entering house-N marks seat N visited (ST-only info)', () => {
    const r = rig();
    toNight2(r);
    r.st({ type: 'visit_home', seat: 5 });
    expect(r.world.calls).toContain('tp:st:house-5:storyteller');
    expect(r.events('visit_changed')).toEqual([{ type: 'visit_changed', seat: 5 }]);
    expect(r.stView().visitingSeat).toBe(5);
    const monk = r.stView().nightQueue.find((x) => x.character === 'monk')!;
    expect(monk.status).toBe('visiting');
    expect(r.view(5).storytellerVisitingYou).toBe(true);
    for (const seat of [0, 1, 2, 3, 4, 6, 7]) expect(r.view(seat).storytellerVisitingYou).toBe(false);
    // the visit cue went to seat 5 only
    for (const seat of [0, 1, 2, 3, 4, 6, 7])
      expect((r.host.sent.get(`p${seat}`) ?? []).some((m) => m.type === 'sound' && (m.payload as { cue: string }).cue === 'visit')).toBe(false);
    expect((r.host.sent.get('p5') ?? []).some((m) => m.type === 'sound' && (m.payload as { cue: string }).cue === 'visit')).toBe(true);
    // walking out
    r.host.emit({ type: 'location_changed', pid: 'st', location: 'outdoors', prev: 'bld:house-5' });
    expect(r.stView().visitingSeat).toBeNull();
    expect(r.stView().nightQueue.find((x) => x.character === 'monk')!.status).toBe('pending');
    expect(r.events('visit_changed').at(-1)).toEqual({ type: 'visit_changed', seat: null });
  });

  it('entering a home during the day is not a visit', () => {
    const r = rig();
    assign(r);
    r.st({ type: 'begin_first_night' });
    r.st({ type: 'advance_phase', to: 'day' });
    r.host.emit({ type: 'location_changed', pid: 'st', location: 'bld:house-2', prev: 'outdoors' });
    expect(r.stView().visitingSeat).toBeNull();
    expect(r.events('visit_changed')).toHaveLength(0);
  });

  it('views and messages of non-visited players are identical whether or not seat 3 is visited', () => {
    const a = rig();
    const b = rig();
    toNight2(a);
    toNight2(b);
    // b: the ST visits seat 3 and talks to them privately
    b.st({ type: 'visit_home', seat: 3 });
    b.st({ type: 'prompt_player', seat: 3, prompt: { kind: 'acknowledge', title: 'Wake up' } });
    b.st({ type: 'send_info', seat: 3, info: { text: 'You learn something.' } });
    b.host.emit({ type: 'location_changed', pid: 'st', location: 'outdoors', prev: 'bld:house-3' });
    // keep the clocks aligned (b issued more commands)
    a.host.clock.now = b.host.clock.now;
    for (const r of [a, b]) {
      r.st({ type: 'advance_phase', to: 'day' });
    }
    for (const seat of [0, 1, 2, 4, 5, 6, 7]) {
      expect(JSON.stringify(b.view(seat))).toBe(JSON.stringify(a.view(seat)));
      expect(JSON.stringify(b.host.sent.get(`p${seat}`) ?? [])).toBe(JSON.stringify(a.host.sent.get(`p${seat}`) ?? []));
    }
    expect(b.view(3).info.at(-1)!.text).toBe('You learn something.');
    expect(JSON.stringify(b.view(3))).not.toBe(JSON.stringify(a.view(3)));
  });

  it('player projections never include grimoire data', () => {
    const r = rig();
    toNight2(r);
    for (let seat = 0; seat < 8; seat++) {
      const json = JSON.stringify(r.view(seat));
      expect(json).not.toMatch(/grimoire|nightQueue|"poisoned"|demonBluffs|"alerts"/);
    }
    expect(JSON.stringify(r.stView())).toMatch(/grimoire/);
  });
});

describe('ST overrides through the module', () => {
  it('undo_last restores a mistaken kill and re-publishes alive status', () => {
    const r = rig();
    assign(r);
    r.st({ type: 'begin_first_night' });
    r.st({ type: 'advance_phase', to: 'day' });
    r.st({ type: 'kill', seat: 4, announce: true });
    expect(r.game.isAlive('p4')).toBe(false);
    r.st({ type: 'undo_last' });
    expect(r.game.isAlive('p4')).toBe(true);
    expect(r.events('alive_changed').map((e) => (e as { alive: boolean }).alive)).toEqual([false, true]);
  });

  it('declare_winner finishes the game and produces an outcome', () => {
    const r = rig(5, { withWorld: false });
    r.st({ type: 'random_setup' });
    r.st({ type: 'begin_first_night' });
    r.st({ type: 'declare_winner', winner: 'evil', reason: 'Storyteller ruling' });
    expect(r.game.outcome()).toMatchObject({ winner: 'evil', reason: 'Storyteller ruling' });
    expect(r.game.directoryPhase()).toBe('finished');
  });
});
