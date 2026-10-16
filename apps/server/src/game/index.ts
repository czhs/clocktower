// OWNED BY rules-storyteller. Wraps @ct/rules for one lobby: authorisation (ST / seat / phase),
// timers (bedtime countdown, voting clock hand), cross-module events and per-client projections.
// The full GameState never leaves this module; clients only get projectForPlayer / projectForStoryteller.
//
// (gameplay 2026-10-15) Walking-not-teleporting + Storyteller "props":
//   * bedtime: the world module tells us when every seated player is inside their own home
//     (isHome); the rules tick then starts the night. When the countdown ends the rules engine
//     enters "overtime" and we turn on the world's escort (server-driven walk home).
//   * the nomination circle and the escort are synced from the rules state into the world after
//     every change (setCircle / setEscort), so undo and forced phases stay consistent.
//   * physical ST commands (teleport / walk_to / freeze / door_lock / teleport_self) go to the world module; every
//     other command goes through the rules engine, which only advises (alerts), never gates.
//   * structured info logs: phase changes, nominations, tallies, executions, ST command types and
//     rejected actions. Never characters, prompt/info contents or (at night) ST targets.
import { randomBytes } from 'node:crypto';
import { townLayout } from '@ct/assets';
import { homeBuilding, seatOfBuilding, type TownLayout } from '@ct/protocol';
import type { AnnouncementView, C2SParsed, DirectoryPhase, GamePhase, PlayerGameView, StCommand, StorytellerGameView } from '@ct/protocol';
import {
  applyPlayerAction,
  applyStCommand,
  createGame,
  mulberry32,
  noteStoryteller,
  projectForPlayer,
  projectForStoryteller,
  setPlayerConnected,
  setStorytellerConnected,
  setVisiting,
  tick as rulesTick,
  type CommandResult,
  type Effect,
  type GameState,
  type PlayerAction,
  type SoundCue,
} from '@ct/rules';
import type { GameModule, GameOutcome, RoomHost } from '../rooms/modules.js';
// (records) Full game record + play-by-play: the recorder observes every committed change.
import { attachRecorder, GameRecorder, type RecordTrigger } from '../records/index.js';
// (auto-st, v2.1) The town clock (every game) + the automatic Storyteller (storytellerMode 'auto').
import { AUTO_DEFAULTS, type AutoTimings, type DayClockView, type StorytellerMode } from '@ct/protocol';
import { BedtimeMirror, DayClock, autoClockOptions, createAutoStoryteller, relabelForAuto, type AutoCapableGame, type AutoClockOptions, type AutoPort, type AutoStoryteller } from '../auto/index.js';

export interface GameModuleOptions {
  /** Deterministic RNG seed (tests). Default: crypto-random. */
  seed?: number;
  /** Clock-hand time per seat while voting (ms). */
  voteStepMs?: number;
  /** Initial bedtime countdown (s); the ST can change it with set_bedtime_seconds. */
  bedtimeSeconds?: number;
  /** Bedtime: night falls once every player has been home for this long (a theatrical beat). */
  nightfallGraceMs?: number;
  /** Town layout (homes for visits). Default: the shipped @ct/assets layout. */
  layout?: TownLayout;
  /** (auto-st) Automatic games: seed of fate's RNG (default: derived from the engine seed). */
  fateSeed?: number;
  /** (auto-st) Automatic games: timing overrides (tests). */
  auto?: Partial<AutoClockOptions>;
}

type PlayerMsgType = 'game:nominate' | 'game:vote' | 'game:promptResponse' | 'game:slayerShot';

interface PublicSnapshot {
  phase: GamePhase;
  phaseEndsAt: number | null;
  alive: Map<number, boolean>;
  visitingSeat: number | null;
  finished: boolean;
  dayNumber: number;
  /** nomination id -> status (for logging nominations / tallies). */
  noms: Map<string, string>;
  executedSeat: number | null;
}

const NIGHT_PHASES: GamePhase[] = ['first_night', 'night'];
/** Phases during which ST targets are secret (logs carry only the command type). */
const SECRET_PHASES: GamePhase[] = ['first_night', 'night', 'dawn'];
/** Physical "props" handled by the world module. */
const STAGE_COMMANDS = new Set<StCommand['type']>(['teleport', 'walk_to', 'freeze', 'door_lock']);
/** ST commands whose seat is public by day (logged with the seat outside night phases). */
const PUBLIC_SEAT_COMMANDS = new Set<StCommand['type']>([
  'execute',
  'force_execute',
  'set_block',
  'create_nomination',
  'cancel_nomination',
  'start_vote',
  'force_vote',
  'strike_vote',
  'set_vote',
  'teleport',
  'walk_to',
  'freeze',
]);

export function createGameModule(host: RoomHost, opts: GameModuleOptions = {}): AutoCapableGame {
  const opts0 = opts;
  // (auto-st, v2.1) town clock + automatic games. Human games: the Storyteller's 'day_clock' prop.
  let mode: StorytellerMode = 'human';
  let autoTimings: AutoTimings = { ...AUTO_DEFAULTS };
  const humanClock = new DayClock();
  const bedtimeMirror = new BedtimeMirror();
  let auto: AutoStoryteller | null = null;
  /** Timeline entries already relabelled for an automatic game (no human Storyteller). */
  let relabelled = 0;
  const layout = opts.layout ?? townLayout;
  /** Bedtime: since when every seated player has been inside their own home (nightfall beat). */
  let allHomeSince: number | null = null;
  let state: GameState | null = null;
  let stPid: string | null = null;
  /** (records) Observes every committed change (apps/server/src/records). Never throws into the game. */
  let recorder: GameRecorder | null = null;
  function record(trigger: RecordTrigger) {
    if (!recorder || !state) return;
    try {
      recorder.observe(state, host.now(), trigger);
      if (mode === 'auto') relabelTimeline(); // (auto-st)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (recorder.warnings.length < 50) recorder.warnings.push(`observe(${trigger.kind}) failed: ${err}`);
      host.log.error('game recorder failed', { lobbyId: host.lobbyId, trigger: trigger.kind, err });
    }
  }
  const seatByPid = new Map<string, number>();
  const pidBySeat = new Map<number, string>();

  // ---- (auto-st, v2.1) town clock + automatic Storyteller -----------------------------------
  function relabelTimeline() {
    if (!recorder) return;
    const tl = recorder.timeline;
    for (; relabelled < tl.length; relabelled++) tl[relabelled]!.text = relabelForAuto(tl[relabelled]!.text);
  }

  /** The public town clock (identical for every viewer): bedtime mirror, else the day clock. */
  function clockView(): DayClockView | null {
    const s = state;
    if (!s || s.phase === 'finished') return null;
    const bed = bedtimeMirror.view(s, host.now());
    if (bed) return bed;
    return mode === 'auto' ? (auto?.clockView() ?? null) : humanClock.view();
  }

  /** Human games: StCommand 'day_clock' — a prop; it never moves the phases. Not undoable. */
  function dayClockCommand(pid: string, cmd: Extract<StCommand, { type: 'day_clock' }>) {
    const s = state!;
    const now = host.now();
    const err = (code: 'invalid' | 'phase', message: string) => {
      logStCommand(cmd, false, code);
      host.send(pid, 'error', { code, message, for: 'st:command' });
    };
    if (s.phase === 'finished') return err('phase', 'The game is over');
    const mins = (m: number) => `${Math.round(m * 100) / 100} min`;
    let text: string;
    switch (cmd.action) {
      case 'set':
        if (!cmd.stage || cmd.minutes === undefined) return err('invalid', 'Pick a stage and a length');
        if (cmd.stage === 'bedtime') return err('invalid', 'Bedtime has its own countdown (use the bedtime timer)');
        if (s.phase === 'bedtime') return err('phase', 'During bedtime the clock shows the bedtime countdown');
        humanClock.set(cmd.stage, cmd.minutes * 60_000, now);
        text = `set ${cmd.stage} ${mins(cmd.minutes)}`;
        break;
      case 'pause':
        if (!humanClock.pause(now)) return err('invalid', humanClock.isSet ? 'The clock is already paused' : 'No clock is set');
        text = 'paused';
        break;
      case 'resume':
        if (!humanClock.resume(now)) return err('invalid', humanClock.isSet ? 'The clock is not paused' : 'No clock is set');
        text = 'resumed';
        break;
      case 'add':
        if (cmd.minutes === undefined) return err('invalid', 'How many minutes?');
        if (!humanClock.add(cmd.minutes * 60_000, now)) return err('invalid', 'No clock is set');
        text = `+${mins(cmd.minutes)}`;
        break;
      case 'clear':
        humanClock.clear();
        text = 'cleared';
        break;
    }
    logStCommand(cmd, true);
    noteStoryteller(s, now, `Town clock ${text}`);
    record({ kind: 'st', cmd });
    host.markGameDirty();
  }

  /** What the automatic Storyteller may do (every change goes through the engine + commit). */
  const autoPort: AutoPort = {
    state: () => state!,
    now: () => host.now(),
    command(cmd) {
      const s = state!;
      const before = snap(s);
      const r = applyStCommand(s, cmd, { now: host.now() });
      logStCommand(cmd, r.ok, r.ok ? undefined : r.code, 'auto command');
      if (r.ok) commit(before, r.effects, { kind: 'st', cmd });
      return r;
    },
    act(seat, action) {
      const s = state!;
      const before = snap(s);
      const r = applyPlayerAction(s, seat, action, { now: host.now() });
      if (r.ok) commit(before, r.effects, { kind: 'player', seat, action });
      return r;
    },
    note(kind, text, data, seats = []) {
      const s = state;
      if (!s) return;
      const now = host.now();
      noteStoryteller(s, now, `${kind === 'fate' ? 'Fate' : 'Town clock'}: ${text}`);
      if (!recorder) return;
      try {
        relabelTimeline();
        const c = recorder.ctxOf(s, now);
        recorder.timeline.push({
          t: c.t,
          at: c.at,
          day: c.day,
          night: c.night,
          phase: c.phase,
          kind: 'storyteller',
          actors: seats.map((seat) => ({ seat, pid: pidBySeat.get(seat) ?? '' })),
          data: { auto: kind, ...data },
          text,
        });
        relabelled = recorder.timeline.length;
      } catch (e) {
        if (recorder.warnings.length < 50) recorder.warnings.push(`auto note failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    connectedPids: () => [...seatByPid.keys()].filter((pid) => host.member(pid)?.connected),
    seatOf: (pid) => seatByPid.get(pid),
    pidOf: (seat) => pidBySeat.get(seat),
    error: (pid, forType, code, message) => host.send(pid, 'error', { code, message, for: forType }),
    dirty: () => host.markGameDirty(),
  };

  const snap = (s: GameState): PublicSnapshot => ({
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    alive: new Map(s.players.map((p) => [p.seat, p.publicAlive])),
    visitingSeat: s.visitingSeat,
    finished: s.phase === 'finished',
    dayNumber: s.dayNumber,
    noms: new Map((s.day?.nominations ?? []).map((n) => [n.id, n.status])),
    executedSeat: s.day?.executedSeat ?? null,
  });
  /** Last values pushed into the world (circle / escort). */
  let synced = { circle: '', escort: false, settings: '' };

  /** Push rules-side stage state into the world (idempotent). */
  function syncWorld() {
    const s = state;
    const w = world();
    if (!s || !w) return;
    const circle = s.gathering ? s.players.map((p) => p.seat).join(',') : '';
    if (circle !== synced.circle) {
      w.setCircle(s.gathering ? s.players.map((p) => p.seat) : null);
      synced.circle = circle;
    }
    const settings = JSON.stringify(s.settings);
    if (settings !== synced.settings) {
      w.applySettings({ ...s.settings });
      synced.settings = settings;
    }
    const escort = s.phase === 'bedtime' && s.bedtimeOvertime;
    if (escort !== synced.escort) {
      w.setEscort(escort);
      synced.escort = escort;
    }
  }

  function logChanges(before: PublicSnapshot) {
    const s = state!;
    const base = { lobbyId: host.lobbyId, phase: s.phase, day: s.dayNumber };
    if (s.phase !== before.phase) host.log.info('phase changed', { ...base, prev: before.phase });
    for (const n of s.day?.nominations ?? []) {
      const was = before.dayNumber === s.dayNumber ? before.noms.get(n.id) : undefined;
      if (was === n.status) continue;
      if (was === undefined) host.log.info('nomination', { ...base, nominatorSeat: n.nominatorSeat, nomineeSeat: n.nomineeSeat });
      if (n.status === 'voting') host.log.info('vote started', { ...base, nomineeSeat: n.nomineeSeat });
      if (n.status === 'tallied') host.log.info('vote tallied', { ...base, nomineeSeat: n.nomineeSeat, votes: n.voteCount, threshold: n.threshold });
    }
    const ex = s.day?.executedSeat ?? null;
    if (ex !== null && (ex !== before.executedSeat || before.dayNumber !== s.dayNumber)) host.log.info('execution', { ...base, seat: ex });
  }

  function world() {
    try {
      return host.world;
    } catch {
      return null; // unit tests without a world module
    }
  }

  function broadcastAnnouncement(a: AnnouncementView) {
    for (const m of host.members()) host.send(m.pid, 'announcement', a);
  }

  function broadcastSound(cue: SoundCue) {
    for (const m of host.members()) host.send(m.pid, 'sound', { cue });
  }

  function runEffects(effects: Effect[]) {
    for (const e of effects) {
      switch (e.type) {
        case 'announcement':
          broadcastAnnouncement(e.announcement);
          break;
        case 'sound':
          if (e.seats === 'all') broadcastSound(e.cue);
          else
            for (const seat of e.seats) {
              const pid = pidBySeat.get(seat);
              if (pid) host.send(pid, 'sound', { cue: e.cue });
            }
          break;
        case 'visit_home':
          if (stPid) {
            const home = homeBuilding(layout, e.seat);
            if (home) world()?.teleportToBuilding(stPid, home.id, 'storyteller');
          }
          break;
        case 'leave_home':
          // Fast travel back outside the visited home; visit_changed follows from location_changed.
          if (stPid) world()?.exitBuilding(stPid, 'storyteller');
          break;
        case 'travel_speed':
          if (stPid) host.emit({ type: 'travel_speed', pid: stPid, mult: e.mult });
          break;
        case 'send_home':
          // Nightfall placement is the world module's job (phase_changed): players already home
          // walk to bed; only a player still en route (a forced night) is teleported.
          break;
      }
    }
  }

  /** Emit cross-module events for public changes, run side effects, re-send views. */
  function commit(before: PublicSnapshot, effects: Effect[], trigger: RecordTrigger = { kind: 'other' }) {
    const s = state!;
    record(trigger); // (records)
    if (s.phase !== before.phase)
      host.emit({ type: 'phase_changed', phase: s.phase, prev: before.phase, phaseEndsAt: s.phaseEndsAt });
    for (const p of s.players) {
      if (before.alive.get(p.seat) !== p.publicAlive) host.emit({ type: 'alive_changed', pid: p.pid, alive: p.publicAlive });
    }
    if (s.visitingSeat !== before.visitingSeat) {
      host.emit({ type: 'visit_changed', seat: s.visitingSeat });
      if (s.visitingSeat !== null) {
        const pid = pidBySeat.get(s.visitingSeat);
        if (pid) host.send(pid, 'sound', { cue: 'visit' });
      }
    }
    // (auto-st) a Storyteller's day clock belongs to its day: it is cleared when the day ends.
    if (before.phase === 'day' && s.phase !== 'day') humanClock.clear();
    if (!before.finished && s.phase === 'finished') {
      host.emit({ type: 'game_finished' });
      host.markLobbyDirty();
    }
    if (s.phase !== before.phase) host.markLobbyDirty();
    logChanges(before);
    runEffects(effects);
    syncWorld();
    host.markGameDirty();
  }

  function stageCommand(pid: string, cmd: Extract<StCommand, { type: 'teleport' | 'walk_to' | 'freeze' | 'door_lock' }>) {
    const s = state!;
    const w = world();
    if (!w) return host.send(pid, 'error', { code: 'internal', message: 'No world', for: 'st:command' });
    const err = (message: string) => host.send(pid, 'error', { code: 'invalid', message, for: 'st:command' });
    if (cmd.type === 'door_lock') {
      const e = w.setDoorLock(cmd.buildingId, cmd.lock === 'default' ? null : cmd.lock === 'locked');
      if (e) return err(e);
      noteStoryteller(s, host.now(), `Door of ${cmd.buildingId}: ${cmd.lock}`);
      record({ kind: 'st', cmd }); // (records)
      host.markGameDirty();
      return;
    }
    const seats = cmd.who === 'all' ? s.players.map((p) => p.seat) : [...new Set(cmd.who)];
    const pids: string[] = [];
    for (const seat of seats) {
      const p = pidBySeat.get(seat);
      if (!p) return err(`No player in seat ${seat + 1}`);
      pids.push(p);
    }
    const errors: string[] = [];
    for (const p of pids) {
      const e = cmd.type === 'teleport' ? w.teleportTo(p, cmd.to) : cmd.type === 'walk_to' ? w.walkTo(p, cmd.to) : (w.setFrozen(p, cmd.frozen), null);
      if (e) errors.push(`seat ${seatByPid.get(p)! + 1}: ${e}`);
    }
    const whoText = cmd.who === 'all' ? 'everyone' : seats.map((x) => `seat ${x + 1}`).join(', ');
    const what =
      cmd.type === 'teleport' ? `Teleported ${whoText} to ${cmd.to.kind}` : cmd.type === 'walk_to' ? (cmd.to ? `Walking ${whoText} to ${cmd.to.kind}` : `Stopped walking ${whoText}`) : `${cmd.frozen ? 'Froze' : 'Unfroze'} ${whoText}`;
    noteStoryteller(s, host.now(), what);
    record({ kind: 'st', cmd }); // (records)
    host.markGameDirty();
    if (errors.length) err(errors.join('; '));
  }

  function logStCommand(cmd: StCommand, ok: boolean, code?: string, label = 'st command') {
    const s = state;
    const phase = s?.phase ?? null;
    const data: Record<string, unknown> = { lobbyId: host.lobbyId, phase, day: s?.dayNumber ?? 0, cmd: cmd.type };
    if (phase && !SECRET_PHASES.includes(phase) && PUBLIC_SEAT_COMMANDS.has(cmd.type)) {
      const c = cmd as { seat?: number | null; who?: number[] | 'all'; nominatorSeat?: number; nomineeSeat?: number };
      if (c.seat !== undefined) data.seat = c.seat;
      if (c.who !== undefined) data.who = c.who;
      if (c.nominatorSeat !== undefined) data.nominatorSeat = c.nominatorSeat;
      if (c.nomineeSeat !== undefined) data.nomineeSeat = c.nomineeSeat;
    }
    if (ok) host.log.info(label, data);
    else host.log.info(`${label} rejected`, { ...data, code });
  }

  function reportError(pid: string, r: CommandResult, forType: string) {
    if (r.ok) return;
    host.send(pid, 'error', { code: r.code, message: r.error, for: forType });
  }

  function toAction(type: PlayerMsgType, payload: unknown): PlayerAction {
    switch (type) {
      case 'game:nominate':
        return { type: 'nominate', nomineeSeat: (payload as C2SParsed<'game:nominate'>).nomineeSeat };
      case 'game:vote': {
        const p = payload as C2SParsed<'game:vote'>;
        return { type: 'vote', nominationId: p.nominationId, vote: p.vote };
      }
      case 'game:promptResponse': {
        const p = payload as C2SParsed<'game:promptResponse'>;
        const a: Extract<PlayerAction, { type: 'promptResponse' }> = { type: 'promptResponse', promptId: p.promptId };
        if (p.seats) a.seats = p.seats;
        if (p.character) a.character = p.character;
        if (p.yes !== undefined) a.yes = p.yes;
        return a;
      }
      case 'game:slayerShot':
        return { type: 'slayerShot', targetSeat: (payload as C2SParsed<'game:slayerShot'>).targetSeat };
    }
  }

  function handleStLocation(location: string) {
    const s = state;
    if (!s) return;
    const before = snap(s);
    let seat: number | null = null;
    if (NIGHT_PHASES.includes(s.phase)) {
      const home = location.startsWith('bld:') ? seatOfBuilding(layout, location.slice(4)) : null;
      if (home !== null && pidBySeat.has(home)) seat = home;
    }
    if (setVisiting(s, seat)) commit(before, [], { kind: 'visit' });
  }

  const mod: AutoCapableGame = {
    // (auto-st) storytellerMode + timings: the room calls this before start().
    configureMode(m, timings) {
      if (state) return;
      mode = m;
      autoTimings = { ...timings };
    },
    storytellerMode: () => mode,
    handleClock(pid, type, payload) {
      if (!state) return host.send(pid, 'error', { code: 'phase', message: 'No game in progress', for: type });
      if (mode !== 'auto' || !auto) return host.send(pid, 'error', { code: 'forbidden', message: 'The Storyteller runs the clock in this game', for: type });
      auto.handleClock(pid, type, payload);
    },

    onEvent(e) {
      const s = state;
      if (!s) return;
      if (e.type === 'member_connection') {
        const before = snap(s);
        const changed =
          e.pid === stPid
            ? setStorytellerConnected(s, e.connected, host.now())
            : seatByPid.has(e.pid)
              ? setPlayerConnected(s, seatByPid.get(e.pid)!, e.connected)
              : false;
        if (changed) commit(before, [], { kind: 'connection' });
      } else if (e.type === 'location_changed') {
        if (e.pid === stPid) handleStLocation(e.location);
      }
    },

    start(seats, storytellerPid) {
      const seed = opts.seed ?? randomBytes(4).readUInt32LE(0);
      seatByPid.clear();
      pidBySeat.clear();
      for (const x of seats) {
        seatByPid.set(x.pid, x.seat);
        pidBySeat.set(x.seat, x.pid);
      }
      stPid = mode === 'auto' ? null : storytellerPid; // (auto-st) no Storyteller seat in automatic games
      synced = { circle: '', escort: false, settings: '' };
      state = createGame({
        players: seats.map((x) => ({ pid: x.pid, seat: x.seat, name: x.name })),
        rng: mulberry32(seed),
        now: host.now(),
        ...(opts.voteStepMs !== undefined ? { voteStepMs: opts.voteStepMs } : {}),
        ...(opts.bedtimeSeconds !== undefined ? { bedtimeSeconds: opts.bedtimeSeconds } : {}),
      });
      for (const x of seats) setPlayerConnected(state, x.seat, host.member(x.pid)?.connected ?? true);
      if (stPid) setStorytellerConnected(state, host.member(storytellerPid)?.connected ?? true, host.now());
      recorder = new GameRecorder(state, host.now(), stPid); // (records)
      attachRecorder(mod, recorder);
      humanClock.clear();
      relabelled = 0;
      host.emit({ type: 'phase_changed', phase: 'setup', prev: null, phaseEndsAt: null });
      host.markGameDirty();
      host.markLobbyDirty();
      host.log.info('game started', { lobbyId: host.lobbyId, players: seats.length, mode });
      if (mode === 'auto') {
        // (auto-st) fate's RNG is separate from the engine's; both seeds go into the record.
        const fateSeed = opts.fateSeed ?? (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
        auto = createAutoStoryteller(autoPort, autoClockOptions(autoTimings, opts.auto), fateSeed);
        autoPort.note('fate', 'Fate rolls the dice: an automatic game begins.', { decision: 'seeds', engineSeed: seed, fateSeed, timings: { ...autoTimings } });
        auto.start();
      }
    },

    handlePlayer(pid, type, payload) {
      const s = state;
      if (!s) return host.send(pid, 'error', { code: 'phase', message: 'No game in progress', for: type });
      const seat = seatByPid.get(pid);
      if (seat === undefined) return host.send(pid, 'error', { code: 'forbidden', message: 'You are not seated in this game', for: type });
      const before = snap(s);
      const action = toAction(type, payload);
      const r = applyPlayerAction(s, seat, action, { now: host.now() });
      if (!r.ok) {
        const secret = SECRET_PHASES.includes(s.phase);
        host.log.info('player action rejected', { lobbyId: host.lobbyId, phase: s.phase, day: s.dayNumber, action: type, code: r.code, ...(secret ? {} : { seat }) });
        return reportError(pid, r, type);
      }
      commit(before, r.effects, { kind: 'player', seat, action });
      auto?.flushNotes(); // (auto-st) fate's rulings made inside the engine (Virgin / Slayer)
    },

    handleStoryteller(pid, cmd) {
      const s = state;
      if (pid !== host.storytellerPid() || (stPid !== null && pid !== stPid))
        return host.send(pid, 'error', { code: 'forbidden', message: 'Only the Storyteller can do that', for: 'st:command' });
      if (cmd.type === 'teleport_self') {
        // (v2) Click-to-teleport of the Storyteller themselves: works in every phase (and while the
        // lobby waits). A building teleport into a home at night IS a visit: the world emits
        // location_changed and handleStLocation registers it exactly like visit_home. Logged by type only.
        logStCommand(cmd, true);
        const w = world();
        if (!w) return host.send(pid, 'error', { code: 'internal', message: 'No world', for: 'st:command' });
        const e = w.teleportSelf(pid, cmd.to);
        if (e) return host.send(pid, 'error', { code: 'invalid', message: e, for: 'st:command' });
        host.markGameDirty();
        return;
      }
      if (!s) return host.send(pid, 'error', { code: 'phase', message: 'No game in progress', for: 'st:command' });
      if (cmd.type === 'day_clock') return dayClockCommand(pid, cmd); // (auto-st) the town clock prop
      if (STAGE_COMMANDS.has(cmd.type)) {
        if (s.phase === 'finished') return host.send(pid, 'error', { code: 'phase', message: 'The game is over', for: 'st:command' });
        logStCommand(cmd, true);
        return stageCommand(pid, cmd as Extract<StCommand, { type: 'teleport' | 'walk_to' | 'freeze' | 'door_lock' }>);
      }
      const before = snap(s);
      const r = applyStCommand(s, cmd, { now: host.now() });
      logStCommand(cmd, r.ok, r.ok ? undefined : r.code);
      if (!r.ok) return reportError(pid, r, 'st:command');
      // (records) StSettings.pamphlets (mid-game pamphlets, default off) is a server-side setting the
      // engine stores but does not interpret; applied after the engine snapshot, so undo restores it.
      // CONTRACT-REQUEST (rules-storyteller): handle `pamphlets` in set_setting like doorTags.
      if (cmd.type === 'set_setting' && cmd.settings.pamphlets !== undefined && (s.settings.pamphlets === true) !== cmd.settings.pamphlets) {
        s.settings.pamphlets = cmd.settings.pamphlets;
        noteStoryteller(s, host.now(), `Settings: pamphlets=${cmd.settings.pamphlets}`);
      }
      commit(before, r.effects, { kind: 'st', cmd });
    },

    viewFor(pid): PlayerGameView | StorytellerGameView | null {
      const s = state;
      if (!s) return null;
      if (pid === stPid && pid === host.storytellerPid()) {
        const v = projectForStoryteller(s);
        const w = world();
        if (w) v.stage = w.stageView();
        v.clock = clockView(); // (auto-st)
        v.storytellerMode = mode;
        return v;
      }
      const seat = seatByPid.get(pid);
      if (seat === undefined) return null;
      const v = projectForPlayer(s, seat);
      v.clock = clockView(); // (auto-st) public, identical for everyone
      v.storytellerMode = mode;
      return v;
    },

    phase: () => state?.phase ?? null,

    directoryPhase(): DirectoryPhase {
      switch (state?.phase) {
        case undefined:
          return 'waiting';
        case 'setup':
          return 'starting';
        case 'first_night':
        case 'bedtime':
        case 'night':
          return 'night';
        case 'day':
        case 'dawn':
          return 'day';
        case 'finished':
          return 'finished';
      }
    },

    isAlive(pid) {
      const seat = seatByPid.get(pid);
      if (!state || seat === undefined) return true;
      // Public status only: night deaths stay hidden (no ghost skin) until dawn.
      return state.players.find((p) => p.seat === seat)?.publicAlive ?? true;
    },

    seatOf: (pid) => seatByPid.get(pid) ?? null,

    tick(now) {
      const s = state;
      if (!s) return;
      auto?.tick(now); // (auto-st) the automatic Storyteller decides first; the engine's timers follow
      const before = snap(s);
      // Bedtime: night falls once every seated player is inside their own home (world module).
      const w = world();
      let opts = {};
      if (w && s.phase === 'bedtime') {
        const home = [...seatByPid.keys()].every((pid) => w.isHome(pid));
        // The beat restarts whenever someone leaves home or the Storyteller is away.
        if (!home || !s.storytellerConnected) allHomeSince = null;
        else allHomeSince ??= now;
        opts = { everyoneHome: home && now - allHomeSince! >= (opts0.nightfallGraceMs ?? 3000) };
      } else allHomeSince = null;
      const r = rulesTick(s, now, opts);
      if (r.changed) commit(before, r.effects, { kind: 'tick' });
      auto?.flushNotes();
    },

    outcome(): GameOutcome | null {
      const s = state;
      if (!s || s.phase !== 'finished' || !s.result) return null;
      return {
        winner: s.result.winner,
        reason: s.result.reason,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? host.now(),
        players: s.players.map((p) => ({
          pid: p.pid,
          seat: p.seat,
          startingCharacter: p.startingCharacter,
          finalCharacter: p.character,
          finalAlignment: p.alignment,
          alive: p.alive,
          executed: p.executed,
          died: p.died,
          nominationsMade: p.nominationsMade,
          ghostVoteUsed: p.ghostVoteUsed,
        })),
      };
    },
  };
  return mod;
}
