// OWNED BY auto-st. In-process harness for automatic (Storyteller-less) games: the REAL game module
// (rules engine + AutoStoryteller + recorder) on the lead's FakeHost with a simulated clock, driven by
// seeded bot players that act only through the normal player messages (game:*, clock:*).
import { CHARACTER_INFO, type PlayerGameView, type PromptView } from '@ct/protocol';
import { mulberry32, type GameState, type Rng } from '@ct/rules';
import { createGameModule } from '../src/game/index.js';
import type { AutoCapableGame, AutoClockOptions } from '../src/auto/index.js';
import { recorderOf } from '../src/records/index.js';
import { createWorldModule } from '../src/world/index.js';
import type { WorldModule } from '../src/rooms/modules.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

export const FAST: Partial<AutoClockOptions> = {
  discussionMs: 2_000,
  nominationsMs: 8_000,
  bedtimeSec: 10,
  nightMinMs: 1_500,
  promptTimeoutMs: 2_000,
  setupBeatMs: 500,
  voteDelayMs: 400,
  stragglerMs: 1_000,
  afterExecutionMs: 1_000,
  extensionMinuteMs: 1_000,
};

export interface BotPolicy {
  /** Chance per tick that a bot answers an open prompt (0 = never: timeouts). */
  answer: number;
  /** Chance per tick that a living bot who may nominate does so while nominations are open. */
  nominate: number;
  /** Chance a bot raises a hand on a nomination (decided once per nomination). */
  vote: number;
  /** Chance per tick of a (bluffed or real) Slayer shot. */
  slayer: number;
  /** Chance per tick of proposing a clock extension. */
  propose: number;
  /** Chance a bot votes yes on an extension (decided once per proposal). */
  extendYes: number;
}

export const DEFAULT_POLICY: BotPolicy = { answer: 0.4, nominate: 0.08, vote: 0.55, slayer: 0.003, propose: 0.0005, extendYes: 0.5 };

export interface AutoRig {
  host: FakeHost;
  game: AutoCapableGame;
  n: number;
  rng: Rng;
  policy: BotPolicy;
  state(): GameState;
  view(seat: number): PlayerGameView;
  pid(seat: number): string;
  /** Advance simulated time by ms (one server tick). */
  step(ms?: number): void;
  /** One round of bot decisions (only seats in `bots`). */
  bots(): void;
  /** Seats driven by bots (others idle). */
  active: Set<number>;
  setConnected(seat: number, connected: boolean): void;
  errors(seat: number): { code: string; message: string; for?: string }[];
}

export function autoRig(n: number, o: { seed?: number; fateSeed?: number; botSeed?: number; auto?: Partial<AutoClockOptions>; policy?: Partial<BotPolicy>; world?: boolean } = {}): AutoRig {
  const host = createFakeHost(`auto${n}`);
  for (let i = 0; i < n; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `Bot${i + 1}`, isHost: i === 0 });
  const game = createGameModule(host, { seed: o.seed ?? 1, voteStepMs: 100, nightfallGraceMs: 0, auto: { ...FAST, ...o.auto }, ...(o.fateSeed !== undefined ? { fateSeed: o.fateSeed } : {}) });
  // Optional REAL world module (walk home at bedtime, escort, nightfall when everyone is home).
  let world: WorldModule | null = null;
  if (o.world) {
    world = createWorldModule(host);
    host.setModules({ game, world });
    for (let i = 0; i < n; i++) host.emit({ type: 'member_joined', pid: `p${i}` });
    host.emit({ type: 'game_started', seats: Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, seat: i })), storytellerPid: '' });
  } else host.setModules({ game });
  game.configureMode('auto', { discussionMin: 1, nominationsMin: 1, bedtimeSec: 15, nightSec: 20 });
  game.start(
    Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, seat: i, name: `Bot${i + 1}` })),
    '',
  );
  const rng = mulberry32(o.botSeed ?? 7);
  const policy = { ...DEFAULT_POLICY, ...o.policy };
  const voted = new Set<string>();
  const extVoted = new Set<string>();
  const rig: AutoRig = {
    host,
    game,
    n,
    rng,
    policy,
    active: new Set(Array.from({ length: n }, (_, i) => i)),
    state: () => recorderOf(game)!.state,
    view: (seat) => game.viewFor(`p${seat}`) as PlayerGameView,
    pid: (seat) => `p${seat}`,
    step(ms = 100) {
      host.clock.now += ms;
      world?.tick(ms);
      game.tick(host.clock.now);
    },
    setConnected(seat, connected) {
      host.member(`p${seat}`)!.connected = connected;
      host.emit({ type: 'member_connection', pid: `p${seat}`, connected });
    },
    errors: (seat) => (host.sent.get(`p${seat}`) ?? []).filter((m) => m.type === 'error').map((m) => m.payload as { code: string; message: string; for?: string }),
    bots() {
      for (const seat of rig.active) {
        if (!host.member(`p${seat}`)!.connected) continue;
        const v = rig.view(seat);
        if (!v || v.phase === 'finished') continue;
        botAct(rig, seat, v, voted, extVoted);
      }
    },
  };
  return rig;
}

function randomSeats(rig: AutoRig, v: PlayerGameView, q: PromptView): number[] {
  const min = q.minTargets ?? 1;
  const max = q.maxTargets ?? min;
  const me = v.you.seat;
  const legal = v.players.filter((p) => (q.allowSelf !== false || p.seat !== me) && (q.allowDead !== false || p.alive)).map((p) => p.seat);
  const out: number[] = [];
  const pool = [...legal];
  const k = Math.max(min, Math.min(max, 1));
  while (out.length < k && pool.length) out.push(pool.splice(Math.floor(rig.rng() * pool.length), 1)[0]!);
  return out;
}

function botAct(rig: AutoRig, seat: number, v: PlayerGameView, voted: Set<string>, extVoted: Set<string>) {
  const pid = `p${seat}`;
  const p = rig.policy;
  const r = rig.rng;
  for (const q of v.prompts) {
    if (r() >= p.answer) continue;
    if (q.kind === 'choose_players') rig.game.handlePlayer(pid, 'game:promptResponse', { promptId: q.id, seats: randomSeats(rig, v, q) });
    else if (q.kind === 'choose_character') rig.game.handlePlayer(pid, 'game:promptResponse', { promptId: q.id, character: q.characterOptions?.[0] ?? 'chef' });
    else if (q.kind === 'yes_no') rig.game.handlePlayer(pid, 'game:promptResponse', { promptId: q.id, yes: r() < 0.5 });
    else rig.game.handlePlayer(pid, 'game:promptResponse', { promptId: q.id });
  }
  if (v.phase !== 'day' || !v.day) return;
  const d = v.day;
  const busy = d.nominations.some((n) => n.status === 'pending' || n.status === 'voting');
  if (d.nominationsOpen && v.you.canNominate && !busy && r() < p.nominate) {
    const targets = v.players.filter((x) => !x.wasNominatedToday);
    if (targets.length) rig.game.handlePlayer(pid, 'game:nominate', { nomineeSeat: targets[Math.floor(r() * targets.length)]!.seat });
  }
  for (const n of d.nominations) {
    if (n.status !== 'pending' && n.status !== 'voting') continue;
    const key = `${n.id}:${seat}`;
    if (voted.has(key) || seat in n.votes) continue;
    voted.add(key);
    if ((v.you.alive || v.you.ghostVoteAvailable) && r() < p.vote) rig.game.handlePlayer(pid, 'game:vote', { nominationId: n.id, vote: true });
  }
  if (v.you.canSlayerShot && r() < p.slayer) {
    const alive = v.players.filter((x) => x.alive && x.seat !== seat);
    if (alive.length) rig.game.handlePlayer(pid, 'game:slayerShot', { targetSeat: alive[Math.floor(r() * alive.length)]!.seat });
  }
  const c = v.clock;
  if (c?.proposal && !extVoted.has(`${c.proposal.id}:${seat}`)) {
    extVoted.add(`${c.proposal.id}:${seat}`);
    if (c.proposal.by !== pid) rig.game.handleClock(pid, 'clock:vote', { id: c.proposal.id, yes: r() < p.extendYes });
  } else if (c && !c.proposal && (c.stage === 'discussion' || c.stage === 'nominations') && r() < p.propose) {
    rig.game.handleClock(pid, 'clock:propose', { minutes: 1 + Math.floor(r() * 3) });
  }
}

/** Run until the game finishes (or maxMs simulated). Calls `check` after every tick. */
export function playOut(rig: AutoRig, maxMs = 4 * 3600_000, check?: (rig: AutoRig) => void): { finished: boolean; simulatedMs: number; ticks: number } {
  const t0 = rig.host.clock.now;
  let ticks = 0;
  while (rig.host.clock.now - t0 < maxMs) {
    rig.bots();
    rig.step(100);
    ticks++;
    check?.(rig);
    if (rig.game.phase() === 'finished') return { finished: true, simulatedMs: rig.host.clock.now - t0, ticks };
  }
  return { finished: false, simulatedMs: rig.host.clock.now - t0, ticks };
}

/** Engine invariants that must hold in every reachable state of a legal game. */
export function legalState(s: GameState): string[] {
  const out: string[] = [];
  const livingDemons = s.players.filter((p) => p.alive && CHARACTER_INFO[p.character].type === 'demon');
  if (s.phase !== 'finished' && s.assigned && s.phase !== 'setup' && !s.resultPending && livingDemons.length !== 1) out.push(`living demons: ${livingDemons.length}`);
  if (livingDemons.length > 1) out.push('more than one living Demon');
  for (const p of s.players) {
    if (p.alive && p.died && !p.alive) out.push('impossible');
    if (!p.alive && p.publicAlive && s.phase === 'day') out.push(`seat ${p.seat} dead but public alive by day`);
    if (p.character === 'drunk' && CHARACTER_INFO[p.believedCharacter].type !== 'townsfolk') out.push('Drunk believes a non-Townsfolk');
    if (p.alignment === 'evil' && CHARACTER_INFO[p.character].alignment === 'good' && p.character !== 'imp') out.push(`seat ${p.seat} evil good character`);
  }
  if (s.redHerringSeat !== null) {
    const rh = s.players.find((p) => p.seat === s.redHerringSeat);
    if (!rh || CHARACTER_INFO[rh.startingCharacter].alignment !== 'good') out.push('red herring not good');
  }
  if (s.day && s.day.nominations.filter((n) => n.status === 'voting').length > 1) out.push('two votes running');
  if (s.day && s.day.executionOccurred && s.day.nominations.some((n) => n.status === 'voting')) out.push('vote after execution');
  return out;
}
