// LEAD-OWNED integration contract between the GameRoom (lobby-auth) and the three gameplay
// modules: GameModule (rules-storyteller, apps/server/src/game), WorldModule (world-art,
// apps/server/src/world) and VoiceModule (voice, apps/server/src/voice).
//
// One instance of each module exists per GameRoom (= per lobby). Modules never touch other
// lobbies, never hold Colyseus Client objects, and communicate only through RoomHost.

import type {
  Alignment,
  C2SParsed,
  CharacterId,
  Cosmetics,
  DirectoryPhase,
  GamePhase,
  LocationId,
  MemberRole,
  PlayerGameView,
  S2CMessages,
  S2CType,
  StageTarget,
  StageView,
  StSelfTarget,
  StSettings,
  StorytellerGameView,
  WorldSnapshot,
} from '@ct/protocol';

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface RoomMember {
  pid: string;
  accountId: string;
  displayName: string;
  role: MemberRole;
  /** Player seat 0..14 (= house index) once the game starts; null before / for ST. */
  seat: number | null;
  connected: boolean;
  cosmetics: Cosmetics;
  isHost: boolean;
}

/** Cross-module notifications, dispatched synchronously by the GameRoom to every module's onEvent. */
export type RoomEvent =
  | { type: 'member_joined'; pid: string }
  | { type: 'member_left'; pid: string } // seat released (waiting) or grace expired
  | { type: 'member_connection'; pid: string; connected: boolean }
  | { type: 'role_changed'; pid: string; role: MemberRole } // storyteller seat moved (waiting only)
  | { type: 'game_started'; seats: { pid: string; seat: number }[]; storytellerPid: string }
  | { type: 'phase_changed'; phase: GamePhase; prev: GamePhase | null; phaseEndsAt: number | null }
  | { type: 'location_changed'; pid: string; location: LocationId; prev: LocationId | null }
  | { type: 'alive_changed'; pid: string; alive: boolean }
  | { type: 'visit_changed'; seat: number | null } // ST entered/left a home at night (ST-only info!)
  | { type: 'travel_speed'; pid: string; mult: number }
  | { type: 'game_finished' };

export interface RoomHost {
  readonly lobbyId: string;
  /** 'development' | 'production' — used for LiveKit room namespacing. */
  readonly env: string;
  readonly log: Logger;
  now(): number;
  members(): readonly RoomMember[];
  member(pid: string): RoomMember | undefined;
  storytellerPid(): string | null;
  /** Send to one member if connected (no-op otherwise). */
  send<T extends S2CType>(pid: string, type: T, payload: S2CMessages[T]): void;
  /** Dispatch to all modules (including the sender) after the current handler returns. */
  emit(event: RoomEvent): void;
  /** Ask the room to re-send per-client game views at the end of this tick. */
  markGameDirty(): void;
  /** Ask the room to re-send the lobby view (and directory summary) at the end of this tick. */
  markLobbyDirty(): void;
  readonly game: GameModule;
  readonly world: WorldModule;
  readonly voice: VoiceModule;
}

export interface GameOutcome {
  winner: Alignment;
  reason: string;
  startedAt: number;
  endedAt: number;
  players: {
    pid: string;
    seat: number;
    startingCharacter: CharacterId;
    finalCharacter: CharacterId;
    finalAlignment: Alignment;
    alive: boolean;
    executed: boolean;
    died: boolean;
    nominationsMade: number;
    ghostVoteUsed: boolean;
  }[];
}

export interface GameModule {
  onEvent(e: RoomEvent): void;
  /** Called by the room on 'lobby:start' after it validated ST + 5..15 seated players. */
  start(seats: { pid: string; seat: number; name: string }[], storytellerPid: string): void;
  handlePlayer(
    pid: string,
    type: 'game:nominate' | 'game:vote' | 'game:promptResponse' | 'game:slayerShot',
    payload: C2SParsed<'game:nominate'> | C2SParsed<'game:vote'> | C2SParsed<'game:promptResponse'> | C2SParsed<'game:slayerShot'>,
  ): void;
  handleStoryteller(pid: string, cmd: C2SParsed<'st:command'>): void;
  /** Per-client projection. null before the game starts. */
  viewFor(pid: string): PlayerGameView | StorytellerGameView | null;
  phase(): GamePhase | null;
  directoryPhase(): DirectoryPhase;
  isAlive(pid: string): boolean;
  seatOf(pid: string): number | null;
  /** Fixed-rate tick for timers (bedtime countdown etc.). */
  tick(now: number): void;
  /** Non-null once the game is finished; consumed by stats persistence (idempotent by matchId). */
  outcome(): GameOutcome | null;
}

export interface WorldModule {
  onEvent(e: RoomEvent): void;
  handleMove(pid: string, msg: C2SParsed<'move'>): void;
  handleUseDoor(pid: string, msg: C2SParsed<'world:useDoor'>): void;
  locationOf(pid: string): LocationId | null;
  positionOf(pid: string): { x: number; y: number } | null;
  /** Visibility-filtered snapshot for this viewer (night: own home only; ST sees all). */
  snapshotFor(pid: string): WorldSnapshot;
  /** Storyteller fast-travel / forced relocation (e.g. 'visit_home'). */
  sendHome(pid: string, reason: 'bedtime' | 'night'): void;
  teleportToBuilding(pid: string, buildingId: string, reason: 'storyteller' | 'door'): void;
  /** Move a member out of the building they are in to just outside its door (ST 'leave_home'). No-op outdoors. */
  exitBuilding(pid: string, reason: 'storyteller' | 'door'): void;
  // ---- (gameplay 2026-10-15) walking-not-teleporting, nomination circle, Storyteller "props".
  /** Mark the nomination circle for these seats (spots = protocol circleSpots), or dissolve it (null). */
  setCircle(seats: number[] | null): void;
  /**
   * Bedtime overtime. on: every seated player who is not inside their own home is walked there by the
   * server (A* on the tile grid, through doors, at walking speed); players already home cannot leave.
   * off: stop those walks and hand control back.
   */
  setEscort(on: boolean): void;
  /** True when the seated player is inside their own home. */
  isHome(pid: string): boolean;
  /** Storyteller teleport of a player (seat spot / bed / square / next to the ST / building / map point). Returns an error message or null. */
  teleportTo(pid: string, to: StageTarget): string | null;
  /** Server-driven walk at walking speed to a target (null = stop). Returns an error message or null. */
  walkTo(pid: string, to: StageTarget | null): string | null;
  /** Freeze / unfreeze a player's own movement and door use (server-driven walks and teleports still apply). */
  setFrozen(pid: string, frozen: boolean): void;
  /** Door override for players: true locked, false forced open, null = phase default. Returns an error message or null. */
  setDoorLock(buildingId: string, locked: boolean | null): string | null;
  /** Presence of every seated player + door overrides (ST-only; the game module puts it in the Storyteller view). */
  stageView(): StageView;
  /** (gameplay) Storyteller settings that affect the world (door tags on/off). Synced by the game module after every change. */
  applySettings(settings: StSettings): void;
  /**
   * (v2, server-v2) Storyteller click-to-teleport of THEMSELVES: a map point -> the nearest free
   * OUTDOOR spot; a building -> inside it at its visit point (houses) / interior door, exactly like
   * teleportToBuilding(pid, id, 'storyteller'), so night-visit tracking (location_changed) applies.
   * Teleport reason 'storyteller'. Returns an error message or null.
   */
  teleportSelf(pid: string, to: StSelfTarget): string | null;
  tick(dtMs: number): void;
}

export interface VoiceModule {
  onEvent(e: RoomEvent): void;
  handleStatus(pid: string, msg: C2SParsed<'voice:status'>): void;
  handleAnnounce(pid: string, msg: C2SParsed<'voice:announce'>): void;
  /** pids that can currently hear `pid` (used to scope in-game text chat identically to voice). */
  audienceOf(pid: string): string[];
  tick(now: number): void;
  dispose(): Promise<void>;
}

export type ModuleFactory<M> = (host: RoomHost) => M;
