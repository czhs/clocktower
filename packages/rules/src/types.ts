// Server-only game state for @ct/rules. NEVER send any of these objects to a client: clients
// receive only the whitelisted projections built in project.ts.
import type {
  Alignment,
  AnnouncementView,
  CharacterId,
  EvilTeamView,
  GamePhase,
  GameResult,
  InfoView,
  NightStepStatus,
  PromptKind,
  SpyGrimoireView,
} from '@ct/protocol';

/** Deterministic random source in [0, 1). Injected so the engine stays pure and testable. */
export type Rng = () => number;

export interface PromptState {
  id: string;
  kind: PromptKind;
  title: string;
  body?: string;
  minTargets?: number;
  maxTargets?: number;
  allowSelf?: boolean;
  allowDead?: boolean;
  characterOptions?: CharacterId[];
  stepId: string | null;
}

export interface PlayerState {
  seat: number;
  pid: string;
  name: string;
  /** True character (the Drunk's is 'drunk'). */
  character: CharacterId;
  /** What the player has been told. */
  believedCharacter: CharacterId;
  alignment: Alignment;
  believedAlignment: Alignment;
  startingCharacter: CharacterId;
  /** True status (night deaths flip this immediately). */
  alive: boolean;
  /** Status as known to players (night deaths are published when day starts). */
  publicAlive: boolean;
  ghostVoteAvailable: boolean;
  ghostVoteUsed: boolean;
  poisonedBy: 'poisoner' | 'storyteller' | null;
  /** ST marked a non-Drunk player as drunk (the real Drunk is always drunk). */
  drunkOverride: boolean;
  protectedTonight: boolean;
  reminders: string[];
  executed: boolean;
  died: boolean;
  nominationsMade: number;
  nominatedToday: boolean;
  wasNominatedToday: boolean;
  /** Once-per-game ability spent: Slayer shot (real Slayer), Virgin triggered. */
  abilityUsed: boolean;
  /** Player has made a public Slayer claim/shot (anyone may bluff once). */
  slayerShotTaken: boolean;
  butlerMasterSeat: number | null;
  connected: boolean;
  info: InfoView[];
  prompts: PromptState[];
  /** (gameplay) Recently sent prompts (open or answered, newest last, at most 10) for re-sending. */
  promptHistory: PromptState[];
  promptSeq: number;
  infoSeq: number;
  evilTeam: EvilTeamView | null;
  spyGrimoire: SpyGrimoireView | null;
}

export type StepKind = CharacterId | 'minion_info' | 'demon_info' | 'dusk' | 'dawn';

export interface NightStep {
  id: string;
  seat: number | null;
  kind: StepKind;
  /** Order position used for sorting / dynamic insertion. */
  order: number;
  status: NightStepStatus;
  response?: { seats?: number[]; character?: CharacterId; yes?: boolean };
  /** Stable engine picks made when the night was built (Washerwoman pair etc.). */
  fixed?: { seats?: number[]; character?: CharacterId | null; number?: number };
  /** Status before the ST walked in (restored when they leave without acting). */
  preVisitStatus?: NightStepStatus;
  infoSent?: boolean;
  /** Outcome text after resolution (ST-only). */
  outcome?: string;
}

export interface NominationState {
  id: string;
  nominatorSeat: number;
  nomineeSeat: number;
  status: 'pending' | 'voting' | 'tallied' | 'cancelled';
  votes: Record<number, boolean>;
  threshold: number;
  voteCount: number;
  /** ceil(alive/2) when the vote was tallied (to recompute the block after a struck vote). */
  minVotes?: number;
  /** (gameplay) Hands raised before the clock starts (players may vote as soon as the nomination exists). */
  hands?: number[];
}

export interface VoteState {
  nominationId: string;
  /** Clockwise seat order starting after the nominee and ending with the nominee. */
  order: number[];
  index: number;
  nextAt: number;
  hands: number[];
  /** (gameplay) ST paused the clock hand: ms that were left until the next seat locks. */
  pausedRemainingMs?: number | null;
}

export interface DayState {
  nominationsOpen: boolean;
  nominations: NominationState[];
  block: { seat: number; votes: number } | null;
  /** Highest vote count reached today that put someone on (or tied for) the block. */
  highWater: number;
  executedSeat: number | null;
  executionOccurred: boolean;
  vote: VoteState | null;
  nomSeq: number;
  /** The ST overrode today's Mayor win (do not propose it again today). */
  mayorOverridden?: boolean;
}

export interface GameState {
  version: 1;
  players: PlayerState[];
  phase: GamePhase;
  dayNumber: number;
  nightNumber: number;
  phaseEndsAt: number | null;
  bedtimeSeconds: number;
  bedtimePausedRemainingMs: number | null;
  /** (gameplay) The ST holds the bedtime countdown (bedtime_timer pause); nightfall waits too. */
  bedtimeHeld: boolean;
  /** (gameplay) Countdown over: stragglers are walked home; night falls once everyone is home. */
  bedtimeOvertime: boolean;
  /** (gameplay) This bedtime was rung from setup and leads into the first night. */
  bedtimeFirst: boolean;
  /** (gameplay) Nomination circle gathered (day / setup only). */
  gathering: boolean;
  /** (gameplay) Storyteller settings (generic toggles: door tags, …). */
  settings: import('@ct/protocol').StSettings;
  storytellerConnected: boolean;
  assigned: boolean;
  rolesRevealed: boolean;
  demonBluffs: CharacterId[];
  redHerringSeat: number | null;
  nightQueue: NightStep[];
  stepSeq: number;
  day: DayState | null;
  /** Seat that died by execution on the most recent day (Undertaker). */
  lastExecutedDiedSeat: number | null;
  visitingSeat: number | null;
  travelSpeedMult: number;
  announcements: AnnouncementView[];
  annSeq: number;
  alerts: string[];
  log: { at: number; text: string }[];
  result: GameResult | null;
  /**
   * `result` was detected by the engine but not yet confirmed by the ST: the game is NOT finished,
   * players see nothing, undo still works. confirm_result finishes, override_result clears it.
   */
  resultPending: boolean;
  startedAt: number;
  endedAt: number | null;
  voteStepMs: number;
  /** Injected RNG (not part of snapshots). */
  rng: Rng;
  /**
   * (auto-st, additive) Optional rulings for automatic (Storyteller-less) games. Absent in human
   * games: the engine then only raises alerts and the Storyteller decides. Not part of snapshots.
   */
  adjudicator?: Adjudicator;
  /** Undo entries (newest last; not part of snapshots). */
  history: HistoryEntry[];
}

/**
 * (auto-st, additive) Storyteller judgement calls the engine can ask for when there is no human
 * Storyteller (apps/server/src/auto). Each hook is optional; without it the engine behaves exactly
 * as before (alert for the Storyteller).
 */
export interface Adjudicator {
  /** A healthy Spy nominated a healthy, living Virgin (first nomination): does the Spy register as a Townsfolk (executed on the spot)? */
  spyRegistersAsTownsfolk?(spy: PlayerState, virgin: PlayerState): boolean;
  /** A real, healthy Slayer shot a healthy Recluse: does the Recluse register as the Demon (and die)? */
  recluseRegistersAsDemon?(recluse: PlayerState, slayer: PlayerState): boolean;
  /** A healthy living Butler's raised hand counts as "no" when their master is not voting (instead of an alert). */
  enforceButler?: boolean;
}

/**
 * One undoable Storyteller command: the state before it, plus the player actions that happened
 * after it (replayed on undo, so the ST's undo never reverts a player's action).
 */
export interface HistoryEntry {
  snap: string;
  replay: { seat: number; action: import('./engine.js').PlayerAction; now: number }[];
}

export interface Ctx {
  now: number;
}

export type SoundCue = 'bell' | 'dawn' | 'toll' | 'door' | 'visit';

/** Side effects for the hosting module to perform (the engine itself does no I/O). */
export type Effect =
  | { type: 'announcement'; announcement: AnnouncementView }
  | { type: 'sound'; cue: SoundCue; seats: number[] | 'all' }
  | { type: 'visit_home'; seat: number }
  | { type: 'leave_home' }
  | { type: 'travel_speed'; mult: number }
  | { type: 'send_home'; reason: 'bedtime' | 'night' };

export type ErrorCode = 'invalid' | 'forbidden' | 'phase' | 'not_found';

export type CommandResult = { ok: true; effects: Effect[] } | { ok: false; code: ErrorCode; error: string };

export class RuleError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
