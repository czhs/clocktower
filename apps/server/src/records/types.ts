// OWNED BY records. The durable, versioned record of one game (docs/game-records.md is the
// human-readable spec of this file; keep both in sync). Stored as JSON in match_records.record_json.
//
// Never in a record: voice data, chat contents, private notebooks, passphrases / tokens / session
// data. Display names are copied as they were at the time; account ids join with `accounts`.
import type { Alignment, CharacterId, GamePhase, Pamphlet, PromptKind, StoryEntry } from '@ct/protocol';

export const GAME_RECORD_VERSION = 1 as const;

export type RecordStatus = 'finished' | 'abandoned';

/** Engine death causes (packages/rules deaths.ts) + 'unknown' (not attributable). */
export type DeathCause = 'demon' | 'execution' | 'slayer' | 'virgin' | 'storyteller' | 'starpass' | 'unknown';

/** What caused a change: an ST command type, a player action type, or the engine clock. */
export type Via = `st:${string}` | `player:${string}` | 'tick' | 'connection' | 'visit' | 'start' | 'other';

export interface Ctx {
  at: number;
  /** ms since the game started. */
  t: number;
  day: number;
  night: number;
  phase: GamePhase;
}

export interface PersonRecord {
  pid: string;
  accountId: string | null;
  /** The account's display name at game start. */
  displayName: string;
  /** The name shown in the lobby (duplicates get a " (2)" suffix). */
  label: string;
}

export interface SeatRecord extends PersonRecord {
  seat: number;
  /** Roster character (avatar) id from @ct/assets cast.ts (Cosmetics.preset), null if none. */
  avatarId: string | null;
  startingCharacter: CharacterId | null;
  startingAlignment: Alignment | null;
  /** What they were told at the start (differs for the Drunk). */
  startingBelievedCharacter: CharacterId | null;
  finalCharacter: CharacterId | null;
  finalAlignment: Alignment | null;
  finalBelievedCharacter: CharacterId | null;
  aliveAtEnd: boolean;
  /** null when the game was abandoned (no winner). */
  won: boolean | null;
  /** Last effective (not undone, not revived) death. */
  death: { at: number; day: number; night: number; phase: GamePhase; cause: DeathCause } | null;
  executed: boolean;
  /** Days on which they were executed (a Storyteller may force more than one). */
  executedDays: number[];
  ghostVoteUsed: boolean;
  ghostVote: { at: number; day: number; nominationId: string } | null;
  nominationsMade: string[];
  nominationsReceived: string[];
  /** Every locked vote of theirs (yes and no). */
  votes: { nominationId: string; day: number; yes: boolean; ghost: boolean }[];
  connectedAtEnd: boolean;
}

export interface PhaseSpan {
  phase: GamePhase;
  day: number;
  night: number;
  startedAt: number;
  endedAt: number | null;
  via: Via;
  undone?: boolean;
}

export interface DayRecord {
  day: number;
  startedAt: number;
  endedAt: number | null;
  nominations: string[];
  /** Executed seats this day (null entry = "nobody is executed" was declared). */
  executions: (number | null)[];
}

export interface NightRecord {
  night: number;
  startedAt: number;
  endedAt: number | null;
  /** Night-step ids in queue order (see `nightSteps`). */
  steps: string[];
  /** Seats the Storyteller visited (in order). */
  visited: number[];
}

export interface VoteRecord {
  seat: number;
  yes: boolean;
  /** A dead player's (publicly dead) yes vote = their ghost vote. */
  ghost: boolean;
  at: number;
}

export interface NominationRecord {
  /** Engine id, e.g. 'd2-nom1' (unique per day; `key` is unique per game). */
  id: string;
  key: string;
  day: number;
  at: number;
  nominatorSeat: number;
  nomineeSeat: number;
  createdBy: 'player' | 'storyteller';
  status: 'pending' | 'voting' | 'tallied' | 'cancelled';
  /** Clockwise order the clock hand used (nominee last). */
  voteOrder: number[] | null;
  votes: VoteRecord[];
  voteCount: number;
  threshold: number;
  /** ceil(alive/2) at the tally. */
  minVotes: number | null;
  talliedAt: number | null;
  result: 'on_the_block' | 'tie' | 'not_enough' | 'cancelled' | 'virgin' | 'not_voted';
  nomineeExecuted: boolean;
  undone?: boolean;
}

export interface ExecutionRecord {
  day: number;
  at: number;
  /** null = the Storyteller declared that nobody is executed. */
  seat: number | null;
  cause: 'execution' | 'virgin' | null;
  died: boolean;
  alreadyDead: boolean;
  /** A Storyteller override (force_execute). */
  forced: boolean;
  via: Via;
  undone?: boolean;
}

export interface DeathRecord {
  seat: number;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  cause: DeathCause;
  /** The Storyteller's note (kill.cause). */
  note?: string;
  /** When the town learned of it (dawn / immediately by day). */
  publicAt: number | null;
  revivedAt?: number;
  via: Via;
  undone?: boolean;
}

export interface RoleChangeRecord {
  seat: number;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  from: CharacterId;
  to: CharacterId;
  alignmentFrom: Alignment;
  alignmentTo: Alignment;
  believedFrom: CharacterId;
  believedTo: CharacterId;
  cause: 'storyteller' | 'starpass' | 'scarlet_woman' | 'other';
  via: Via;
  undone?: boolean;
}

export type StatusField =
  | 'poisoned'
  | 'drunk'
  | 'protected'
  | 'butlerMaster'
  | 'ghostVoteAvailable'
  | 'abilityUsed'
  | 'slayerShotTaken'
  | 'reminder'
  | 'believedCharacter'
  | 'redHerring'
  | 'demonBluffs'
  | 'settings'
  | 'bedtimeSeconds';

export interface StatusChangeRecord {
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  /** null = a game-wide setting / setup value. */
  seat: number | null;
  field: StatusField;
  from: unknown;
  to: unknown;
  via: Via;
  undone?: boolean;
}

export interface NightStepRecord {
  id: string;
  night: number;
  order: number;
  /** Character id, or 'minion_info' / 'demon_info' / 'dusk' / 'dawn'. */
  kind: string;
  seat: number | null;
  status: string;
  /** The player's answer to the step's prompt. */
  response?: { seats?: number[]; character?: CharacterId; yes?: boolean };
  /** Storyteller-chosen targets / star-pass / Mayor bounce passed with resolve_step. */
  storytellerInput?: { seats?: number[]; starpassSeat?: number; redirectSeat?: number };
  /** Engine picks made when the night was built (Washerwoman pair etc.). */
  fixed?: { seats?: number[]; character?: CharacterId | null; number?: number };
  outcome?: string;
  infoSent: boolean;
  /** The step's player at resolution: true character, what they acted as, impairments. */
  player?: { character: CharacterId; actingAs: string; poisoned: boolean; drunk: boolean; protected: boolean };
  resolvedAt: number | null;
  infoIds: string[];
  promptIds: string[];
  undone?: boolean;
}

export interface InfoRecord {
  id: string;
  seat: number;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  text: string;
  seats?: number[];
  characters?: CharacterId[];
  number?: number;
  yes?: boolean;
  stepId: string | null;
  undone?: boolean;
}

export interface PromptRecord {
  id: string;
  seat: number;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  kind: PromptKind;
  title: string;
  body?: string;
  minTargets?: number;
  maxTargets?: number;
  characterOptions?: CharacterId[];
  stepId: string | null;
  response: { at: number; seats?: number[]; character?: CharacterId; yes?: boolean } | null;
  undone?: boolean;
}

export interface VisitRecord {
  seat: number;
  night: number;
  startedAt: number;
  endedAt: number | null;
}

export interface CommandRecord {
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  /** The accepted Storyteller command, verbatim (validated by the StCommand schema). */
  cmd: { type: string } & Record<string, unknown>;
}

export interface ActionRecord {
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  seat: number;
  action: { type: string } & Record<string, unknown>;
}

export interface ConnectionRecord {
  at: number;
  /** null = the Storyteller. */
  seat: number | null;
  connected: boolean;
}

export interface LogRecord {
  at: number;
  text: string;
  undone?: boolean;
}

export interface AnnouncementRecord {
  id: string;
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  kind: string;
  text: string;
  undone?: boolean;
}

export interface SetupRecord {
  at: number;
  /** (v2.2) + 'storyline' (deal_preset) / 'bag' (deal_bag): the server shuffled a bag onto the seats. */
  method: 'random' | 'manual' | 'mixed' | 'storyline' | 'bag';
  /** (v2.2) The storyline dealt (method 'storyline', or 'mixed' after one). */
  storyline?: string | null;
  characters: { seat: number; character: CharacterId; alignment: Alignment; believedCharacter: CharacterId }[];
  demonBluffs: CharacterId[];
  redHerringSeat: number | null;
}

export interface ResultRecord {
  winner: Alignment;
  reason: string;
  at: number;
  /** When the engine detected it (null = declared directly by the Storyteller). */
  detectedAt: number | null;
  via: 'confirm_result' | 'declare_winner' | 'other';
  confirmedBy: PersonRecord | null;
}

export interface GameRecordV1 {
  version: typeof GAME_RECORD_VERSION;
  matchId: string;
  lobbyId: string;
  status: RecordStatus;
  script: string;
  lobby: { name: string; maxPlayers: number | null };
  settings: {
    /** At game start / at the end. */
    initial: { bedtimeSeconds: number; voteSeconds: number; doorTags: boolean; pamphlets: boolean };
    final: { bedtimeSeconds: number; voteSeconds: number; doorTags: boolean; pamphlets: boolean };
  };
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** Highest day / night number reached. */
  days: number;
  nights: number;
  storyteller: PersonRecord | null;
  seats: SeatRecord[];
  setup: SetupRecord | null;
  phases: PhaseSpan[];
  dayRecords: DayRecord[];
  nightRecords: NightRecord[];
  nominations: NominationRecord[];
  executions: ExecutionRecord[];
  deaths: DeathRecord[];
  roleChanges: RoleChangeRecord[];
  statusChanges: StatusChangeRecord[];
  nightSteps: NightStepRecord[];
  info: InfoRecord[];
  prompts: PromptRecord[];
  visits: VisitRecord[];
  storytellerCommands: CommandRecord[];
  playerActions: ActionRecord[];
  connections: ConnectionRecord[];
  /** The Storyteller's grimoire log, complete (the in-game view keeps only the last 80 lines). */
  storytellerLog: LogRecord[];
  /** Public announcements, verbatim. */
  announcements: AnnouncementRecord[];
  /** The play-by-play (readable + structured). */
  timeline: StoryEntry[];
  /** Pamphlets the Storyteller released to the town. */
  pamphlets: Pamphlet[];
  result: ResultRecord | null;
  abandon: { reason: AbandonReason; at: number; phase: GamePhase | null; day: number; night: number } | null;
  /** Recorder problems (never thrown at the game); empty when everything was captured. */
  warnings: string[];
}

export type AbandonReason = 'closed_by_admin' | 'idle_timeout' | 'room_disposed' | 'aborted_by_host'; // (auto-st) automatic games: the host ended it
