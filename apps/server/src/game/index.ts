// OWNED BY rules-storyteller. Wraps @ct/rules for one lobby: authorisation (ST / seat / phase),
// timers (bedtime countdown, voting clock hand), cross-module events and per-client projections.
// The full GameState never leaves this module; clients only get projectForPlayer / projectForStoryteller.
import { randomBytes } from 'node:crypto';
import type { AnnouncementView, C2SParsed, DirectoryPhase, GamePhase, PlayerGameView, StorytellerGameView } from '@ct/protocol';
import {
  applyPlayerAction,
  applyStCommand,
  createGame,
  mulberry32,
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

export interface GameModuleOptions {
  /** Deterministic RNG seed (tests). Default: crypto-random. */
  seed?: number;
  /** Clock-hand time per seat while voting (ms). */
  voteStepMs?: number;
  /** Initial bedtime countdown (s); the ST can change it with set_bedtime_seconds. */
  bedtimeSeconds?: number;
}

type PlayerMsgType = 'game:nominate' | 'game:vote' | 'game:promptResponse' | 'game:slayerShot';

interface PublicSnapshot {
  phase: GamePhase;
  phaseEndsAt: number | null;
  alive: Map<number, boolean>;
  visitingSeat: number | null;
  finished: boolean;
}

const NIGHT_PHASES: GamePhase[] = ['first_night', 'night'];

export function createGameModule(host: RoomHost, opts: GameModuleOptions = {}): GameModule {
  let state: GameState | null = null;
  let stPid: string | null = null;
  const seatByPid = new Map<string, number>();
  const pidBySeat = new Map<number, string>();

  const snap = (s: GameState): PublicSnapshot => ({
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    alive: new Map(s.players.map((p) => [p.seat, p.publicAlive])),
    visitingSeat: s.visitingSeat,
    finished: s.phase === 'finished',
  });

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
          if (stPid) world()?.teleportToBuilding(stPid, `house-${e.seat}`, 'storyteller');
          break;
        case 'leave_home':
          // Fast travel back outside the visited home; visit_changed follows from location_changed.
          if (stPid) world()?.exitBuilding(stPid, 'storyteller');
          break;
        case 'travel_speed':
          if (stPid) host.emit({ type: 'travel_speed', pid: stPid, mult: e.mult });
          break;
        case 'send_home': {
          const w = world();
          if (w) for (const pid of seatByPid.keys()) w.sendHome(pid, e.reason);
          break;
        }
      }
    }
  }

  /** Emit cross-module events for public changes, run side effects, re-send views. */
  function commit(before: PublicSnapshot, effects: Effect[]) {
    const s = state!;
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
    if (!before.finished && s.phase === 'finished') {
      host.emit({ type: 'game_finished' });
      host.markLobbyDirty();
    }
    if (s.phase !== before.phase) host.markLobbyDirty();
    runEffects(effects);
    host.markGameDirty();
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
      const m = /^bld:house-(\d+)$/.exec(location);
      if (m && pidBySeat.has(Number(m[1]))) seat = Number(m[1]);
    }
    if (setVisiting(s, seat)) commit(before, []);
  }

  const mod: GameModule = {
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
        if (changed) commit(before, []);
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
      stPid = storytellerPid;
      state = createGame({
        players: seats.map((x) => ({ pid: x.pid, seat: x.seat, name: x.name })),
        rng: mulberry32(seed),
        now: host.now(),
        ...(opts.voteStepMs !== undefined ? { voteStepMs: opts.voteStepMs } : {}),
        ...(opts.bedtimeSeconds !== undefined ? { bedtimeSeconds: opts.bedtimeSeconds } : {}),
      });
      for (const x of seats) setPlayerConnected(state, x.seat, host.member(x.pid)?.connected ?? true);
      setStorytellerConnected(state, host.member(storytellerPid)?.connected ?? true, host.now());
      host.emit({ type: 'phase_changed', phase: 'setup', prev: null, phaseEndsAt: null });
      host.markGameDirty();
      host.markLobbyDirty();
      host.log.info('game started', { lobbyId: host.lobbyId, players: seats.length });
    },

    handlePlayer(pid, type, payload) {
      const s = state;
      if (!s) return host.send(pid, 'error', { code: 'phase', message: 'No game in progress', for: type });
      const seat = seatByPid.get(pid);
      if (seat === undefined) return host.send(pid, 'error', { code: 'forbidden', message: 'You are not seated in this game', for: type });
      const before = snap(s);
      const r = applyPlayerAction(s, seat, toAction(type, payload), { now: host.now() });
      if (!r.ok) return reportError(pid, r, type);
      commit(before, r.effects);
    },

    handleStoryteller(pid, cmd) {
      const s = state;
      if (pid !== host.storytellerPid() || (stPid !== null && pid !== stPid))
        return host.send(pid, 'error', { code: 'forbidden', message: 'Only the Storyteller can do that', for: 'st:command' });
      if (!s) return host.send(pid, 'error', { code: 'phase', message: 'No game in progress', for: 'st:command' });
      const before = snap(s);
      const r = applyStCommand(s, cmd, { now: host.now() });
      if (!r.ok) return reportError(pid, r, 'st:command');
      commit(before, r.effects);
    },

    viewFor(pid): PlayerGameView | StorytellerGameView | null {
      const s = state;
      if (!s) return null;
      if (pid === stPid && pid === host.storytellerPid()) return projectForStoryteller(s);
      const seat = seatByPid.get(pid);
      return seat === undefined ? null : projectForPlayer(s, seat);
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
      const before = snap(s);
      const r = rulesTick(s, now);
      if (r.changed) commit(before, r.effects);
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
