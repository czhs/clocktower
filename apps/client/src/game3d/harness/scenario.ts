// v3 WP7 (v3-qa). The mock-world harness's scenario model and player (docs/v3/INTEGRATION.md §6.3). PURE: no DOM,
// no three, no game3d drawing module, so it is unit-tested in vitest (apps/client/test/game3d/harness.scenario.test.ts).
//
// A scenario (tests/v3/scenarios/<name>.json) replays a lobby without a server:
//   { name, world, viewport?, tier?, me?, members? | lobbyView?, spawn?, steps: [{at, ...}], shots: [{at, name, camera?}],
//     duration? }
// - `members` is a compact cast list the player turns into a full LobbyRoomView (or give `lobbyView` verbatim).
// - steps (ms on the SCENARIO clock): `game` (compact game state -> the viewer's PlayerGameView), or `gameView`
//   verbatim, `snapshot: {entities}` (KEYFRAMES: the player emits 'world:snapshot' at 12 Hz with each entity linearly
//   interpolated in px between its keyframes in one location), `teleport` (the viewer's own avatar), `chat`
//   (a 'chat:message' from a member), `emote` ('social:emote'), `voice: {pid: talking}` (the voice presence store).
// - shots: the page pauses the scenario clock at `at` until the driver took the still (harness/main.ts).
import { DEFAULT_COSMETICS } from '@ct/protocol';
import type {
  ChatMessage,
  EmoteEvent,
  EmoteKind,
  EntityState,
  Facing,
  GamePhase,
  LobbyRoomView,
  LocationId,
  MemberView,
  NominationView,
  PlayerGameView,
  StorytellerGameView,
  WorldId,
  WorldSnapshot,
  WorldTeleport,
} from '@ct/protocol';

/** Snapshot rate of the real server (v2.2 WP4 world:snapshot interval). */
export const SNAPSHOT_HZ = 12;

export interface ScenarioMember {
  pid: string;
  name: string;
  /** v2 cast id (cosmetics.preset). */
  cast: string;
  seat?: number | null;
  role?: 'player' | 'storyteller';
}

export interface ScenarioNomination {
  nominator: number;
  nominee: number;
  status?: NominationView['status'];
  votes?: Record<number, boolean>;
  current?: number | null;
  hands?: number[];
  stepMs?: number;
}

/** Compact game state; expanded into the viewer's own PlayerGameView (or a StorytellerGameView for an ST viewer). */
export interface ScenarioGame {
  phase: GamePhase;
  dayNumber?: number;
  /** pids that are dead. */
  dead?: string[];
  nominationsOpen?: boolean;
  nomination?: ScenarioNomination | null;
  gathering?: boolean;
  /** DayClockView-like stage timer (§3.1 hour): ms from the step's scenario time. */
  clock?: { stage: import('@ct/protocol').DayClockView['stage']; totalMs: number; remainingMs: number; paused?: boolean } | null;
}

export interface ScenarioEntity {
  id: string;
  x: number;
  y: number;
  location?: LocationId;
  facing?: Facing;
  moving?: boolean;
}

export interface ScenarioStep {
  at: number;
  game?: ScenarioGame | null;
  gameView?: PlayerGameView | StorytellerGameView | null;
  snapshot?: { entities: ScenarioEntity[] };
  teleport?: { x: number; y: number; location?: LocationId; reason?: WorldTeleport['reason'] };
  chat?: { from: string; text: string };
  emote?: { pid: string; kind?: EmoteKind; x: number; y: number; target?: string };
  voice?: Record<string, boolean>;
}

export interface ScenarioShot {
  at: number;
  name: string;
  /** Optional camera override for the still (needs a camera hook in the 3D town; recorded as unsupported otherwise). */
  camera?: { focus: [number, number]; viewHeight?: number };
}

export interface Scenario {
  name: string;
  /** 'scenario' (default) replays steps; 'projection' runs the engine-level marker check (§1.5). */
  mode?: 'scenario' | 'projection';
  world: WorldId;
  viewport?: [number, number];
  tier?: 'low' | 'high';
  /** The viewer's pid (default: the first member). */
  me?: string;
  members?: ScenarioMember[];
  lobbyView?: LobbyRoomView;
  /** The viewer's first position (px, feet). Default: the layout's player spawn. */
  spawn?: { x: number; y: number; location?: LocationId };
  steps: ScenarioStep[];
  shots: ScenarioShot[];
  /** Scenario length in ms (default: last step / shot + 1 s). */
  duration?: number;
  /** projection mode: world points (metres) and pixel scales. */
  points?: [number, number, number][];
  scales?: number[];
}

/** One message the fake connection delivers. */
export type HarnessEvent =
  | { kind: 'event'; type: 'world:snapshot'; payload: WorldSnapshot }
  | { kind: 'event'; type: 'world:teleport'; payload: WorldTeleport }
  | { kind: 'event'; type: 'chat:message'; payload: ChatMessage }
  | { kind: 'event'; type: 'social:emote'; payload: EmoteEvent }
  | { kind: 'gameView'; payload: PlayerGameView | StorytellerGameView | null }
  | { kind: 'voice'; payload: Record<string, boolean> }
  | { kind: 'shot'; shot: ScenarioShot };

/** The full LobbyRoomView for a compact member list (lobby in `phase` 'waiting' or 'day'). */
export function lobbyViewOf(s: Pick<Scenario, 'name' | 'world' | 'members' | 'me' | 'lobbyView'>, inGame = false): LobbyRoomView {
  if (s.lobbyView) return s.lobbyView;
  const members = s.members ?? [];
  const me = s.me ?? members[0]?.pid ?? 'me';
  const st = members.find((m) => m.role === 'storyteller');
  const mv: MemberView[] = members.map((m, i) => ({
    pid: m.pid,
    displayName: m.name,
    role: m.role ?? 'player',
    seat: m.role === 'storyteller' ? null : (m.seat ?? i - (st && members.indexOf(st) < i ? 1 : 0)),
    ready: true,
    connected: true,
    isHost: i === 0,
    cosmetics: { ...DEFAULT_COSMETICS, preset: m.cast } as MemberView['cosmetics'],
  }));
  const players = mv.filter((m) => m.role === 'player').length;
  return {
    lobby: {
      id: `harness-${s.name}`,
      name: `Harness ${s.name}`,
      description: '',
      script: 'trouble-brewing',
      maxPlayers: 15,
      playerCount: players,
      storytellerName: st?.name ?? null,
      storytellerSeatOpen: !st,
      phase: inGame ? 'day' : 'waiting',
      joinable: false,
      hostName: members[0]?.name ?? 'Host',
      createdAt: 0,
      updatedAt: 0,
      world: s.world,
    } as LobbyRoomView['lobby'],
    members: mv,
    youPid: me,
    canStart: false,
    startBlockers: [],
    world: s.world,
  };
}

/** The viewer's own game view for a compact game state. `now` = wall clock (for clock.endsAt). */
export function gameViewOf(lv: LobbyRoomView, g: ScenarioGame, now: number): PlayerGameView | StorytellerGameView {
  const dead = new Set(g.dead ?? []);
  const players = lv.members
    .filter((m) => m.role === 'player' && m.seat !== null)
    .map((m) => ({ pid: m.pid, seat: m.seat!, name: m.displayName, alive: !dead.has(m.pid), ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true }))
    .sort((a, b) => a.seat - b.seat);
  const n = g.nomination;
  const alive = players.filter((p) => p.alive).length;
  const day =
    g.phase === 'day' || n
      ? {
          nominationsOpen: g.nominationsOpen ?? !!n,
          nominations: n
            ? [
                {
                  id: 'nom-1',
                  nominatorSeat: n.nominator,
                  nomineeSeat: n.nominee,
                  status: n.status ?? 'voting',
                  votes: n.votes ?? {},
                  currentVoterSeat: n.current ?? null,
                  voteCount: Object.values(n.votes ?? {}).filter(Boolean).length,
                  threshold: Math.ceil(alive / 2),
                  handsRaised: n.hands ?? [],
                  stepMs: n.stepMs ?? 1500,
                },
              ]
            : [],
          onTheBlock: null,
          executedSeat: null,
        }
      : null;
  const clock = g.clock ? { stage: g.clock.stage, totalMs: g.clock.totalMs, remainingMs: g.clock.paused ? g.clock.remainingMs : null, paused: !!g.clock.paused, endsAt: g.clock.paused ? null : now + g.clock.remainingMs } : null;
  const me = lv.members.find((m) => m.pid === lv.youPid);
  const common = { phase: g.phase, dayNumber: g.dayNumber ?? 1, phaseEndsAt: null, players, day, announcements: [], result: null, gathering: !!g.gathering, ...(clock ? { clock } : {}) };
  if (me?.role === 'storyteller')
    return { kind: 'storyteller', ...common, grimoire: [], demonBluffs: [], nightQueue: [], visitingSeat: null, travelSpeedMult: 1, alerts: [], log: [] } as unknown as StorytellerGameView;
  const you = players.find((p) => p.pid === lv.youPid);
  return {
    kind: 'player',
    ...common,
    you: { pid: lv.youPid, seat: you?.seat ?? 0, alive: you?.alive ?? true, ghostVoteAvailable: true, canNominate: true, role: null },
    prompts: [],
    info: [],
    storytellerVisitingYou: false,
  } as unknown as PlayerGameView;
}

interface Key {
  at: number;
  e: ScenarioEntity;
}

const facingOf = (dx: number, dy: number, fallback: Facing): Facing => (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 ? fallback : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');

/** Entity poses at scenario time `t` (ms) from per-id keyframes: linear px interpolation within one location. */
export function entitiesAt(keys: ReadonlyMap<string, readonly Key[]>, t: number): EntityState[] {
  const out: EntityState[] = [];
  for (const [id, ks] of keys) {
    let i = -1;
    for (let k = 0; k < ks.length; k++) if (ks[k]!.at <= t) i = k;
    if (i < 0) continue;
    const a = ks[i]!;
    const b = ks[i + 1];
    const loc = a.e.location ?? 'outdoors';
    if (b && (b.e.location ?? 'outdoors') === loc && b.at > a.at) {
      const f = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
      const dx = b.e.x - a.e.x;
      const dy = b.e.y - a.e.y;
      const moving = a.e.moving ?? (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01);
      out.push({ id, x: a.e.x + dx * f, y: a.e.y + dy * f, location: loc, facing: a.e.facing ?? facingOf(dx, dy, 'down'), moving });
    } else out.push({ id, x: a.e.x, y: a.e.y, location: loc, facing: a.e.facing ?? 'down', moving: a.e.moving ?? false });
  }
  return out;
}

/** Validation errors of a scenario (empty = ok). */
export function validateScenario(s: Scenario): string[] {
  const errs: string[] = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  if (!s.name) errs.push('name missing');
  if (s.world !== 'v2' && s.world !== 'v3') errs.push(`world must be v2|v3 (got ${String(s.world)})`);
  if (!Array.isArray(s.steps)) errs.push('steps must be an array');
  if (!Array.isArray(s.shots)) errs.push('shots must be an array');
  if (s.mode === 'projection') {
    if (!s.points?.length) errs.push('projection: points missing');
    return errs;
  }
  if (!s.lobbyView && !s.members?.length) errs.push('members or lobbyView required');
  const pids = new Set((s.lobbyView?.members ?? s.members ?? []).map((m) => m.pid));
  if (s.me && !pids.has(s.me)) errs.push(`me ${s.me} is not a member`);
  let last = -Infinity;
  for (const [i, st] of (s.steps ?? []).entries()) {
    if (!(st.at >= 0)) errs.push(`steps[${i}].at must be >= 0`);
    if (st.at < last) errs.push(`steps[${i}] out of order (${st.at} < ${last})`);
    last = st.at;
    for (const e of st.snapshot?.entities ?? []) if (!pids.has(e.id)) errs.push(`steps[${i}].snapshot: unknown entity ${e.id}`);
    if (st.chat && !pids.has(st.chat.from)) errs.push(`steps[${i}].chat: unknown member ${st.chat.from}`);
    if (st.emote && !pids.has(st.emote.pid)) errs.push(`steps[${i}].emote: unknown member ${st.emote.pid}`);
  }
  const names = new Set<string>();
  for (const [i, sh] of (s.shots ?? []).entries()) {
    if (!/^[a-z0-9-]+$/.test(sh.name ?? '')) errs.push(`shots[${i}].name must be [a-z0-9-]+`);
    if (names.has(sh.name)) errs.push(`shots[${i}]: duplicate name ${sh.name}`);
    names.add(sh.name);
  }
  return errs;
}

/**
 * Replays a scenario on a scenario clock. `advance(t)` returns, in order, every message due up to scenario time `t`:
 * steps (game views, teleports, chat, emotes, voice), 12 Hz snapshots and shots. A shot is returned once and the
 * caller pauses its clock until the still is taken. Deterministic for a given sequence of `t`.
 */
export class ScenarioPlayer {
  readonly lobbyView: LobbyRoomView;
  readonly duration: number;
  private readonly keys = new Map<string, Key[]>();
  private stepIdx = 0;
  private shotIdx = 0;
  private nextSnapAt = 0;
  private snapNo = 0;
  private readonly shots: ScenarioShot[];
  private msgNo = 0;

  constructor(
    readonly scenario: Scenario,
    private readonly opts: { now?: () => number; ackSeq?: () => number; self?: () => EntityState | null } = {},
  ) {
    const errs = validateScenario(scenario);
    if (errs.length) throw new Error(`scenario ${scenario?.name}: ${errs.join('; ')}`);
    this.lobbyView = lobbyViewOf(scenario, scenario.steps.some((s) => s.game || s.gameView));
    for (const st of scenario.steps)
      for (const e of st.snapshot?.entities ?? []) {
        let ks = this.keys.get(e.id);
        if (!ks) this.keys.set(e.id, (ks = []));
        ks.push({ at: st.at, e });
      }
    this.shots = [...scenario.shots].sort((a, b) => a.at - b.at);
    const lastAt = Math.max(0, ...scenario.steps.map((s) => s.at), ...scenario.shots.map((s) => s.at));
    this.duration = scenario.duration ?? lastAt + 1000;
  }

  get done(): boolean {
    return this.stepIdx >= this.scenario.steps.length && this.shotIdx >= this.shots.length;
  }

  /** Entities (incl. the viewer's own, from `opts.self`) at scenario time t. */
  snapshotAt(t: number): WorldSnapshot {
    const ents = entitiesAt(this.keys, t).filter((e) => e.id !== this.lobbyView.youPid);
    const self = this.opts.self?.();
    if (self) ents.unshift(self);
    return { t: this.opts.now?.() ?? t, ackSeq: this.opts.ackSeq?.() ?? 0, entities: ents };
  }

  advance(t: number): HarnessEvent[] {
    const out: HarnessEvent[] = [];
    const now = this.opts.now?.() ?? t;
    const steps = this.scenario.steps;
    // interleave steps, snapshots and shots in time order (a shot stops the batch: the clock pauses there)
    for (;;) {
      const st = steps[this.stepIdx];
      const shot = this.shots[this.shotIdx];
      const stepAt = st && st.at <= t ? st.at : Infinity;
      const snapAt = this.nextSnapAt <= t ? this.nextSnapAt : Infinity;
      const shotAt = shot && shot.at <= t ? shot.at : Infinity;
      const first = Math.min(stepAt, snapAt, shotAt);
      if (first === Infinity) break;
      if (stepAt === first) {
        this.stepIdx++;
        this.applyStep(st!, now, out);
        continue;
      }
      if (snapAt === first) {
        out.push({ kind: 'event', type: 'world:snapshot', payload: this.snapshotAt(snapAt) });
        this.nextSnapAt = (++this.snapNo * 1000) / SNAPSHOT_HZ; // no float drift over long scenarios
        continue;
      }
      this.shotIdx++;
      out.push({ kind: 'shot', shot: shot! });
      break;
    }
    return out;
  }

  private applyStep(st: ScenarioStep, now: number, out: HarnessEvent[]): void {
    if (st.gameView !== undefined) out.push({ kind: 'gameView', payload: st.gameView });
    else if (st.game !== undefined) out.push({ kind: 'gameView', payload: st.game ? gameViewOf(this.lobbyView, st.game, now) : null });
    if (st.teleport) out.push({ kind: 'event', type: 'world:teleport', payload: { seq: this.opts.ackSeq?.() ?? 0, x: st.teleport.x, y: st.teleport.y, location: st.teleport.location ?? 'outdoors', reason: st.teleport.reason ?? 'storyteller' } as WorldTeleport });
    if (st.chat) {
      const m = this.lobbyView.members.find((x) => x.pid === st.chat!.from);
      out.push({ kind: 'event', type: 'chat:message', payload: { id: `h${++this.msgNo}`, fromPid: st.chat.from, fromName: m?.displayName ?? st.chat.from, text: st.chat.text, scope: 'zone', at: now } });
    }
    if (st.emote) out.push({ kind: 'event', type: 'social:emote', payload: { pid: st.emote.pid, kind: st.emote.kind ?? 'point', x: st.emote.x, y: st.emote.y, ...(st.emote.target ? { target: st.emote.target } : {}), at: now } });
    if (st.voice) out.push({ kind: 'voice', payload: st.voice });
  }
}
